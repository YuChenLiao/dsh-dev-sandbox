import fsp from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BUNDLES, PACKAGE_NAME, SANDBOX_PROFILE } from "../../shared/config.ts";
import { SandboxError } from "../../shared/errors.ts";
import { workHome } from "../../shared/paths.ts";
import {
  API_KEY_ENV,
  BROWSER_SESSION_RECORD,
  CREDENTIALS_FILE,
  ENV_FILE,
  PLATFORM_ACCOUNT_PREFIX,
  PROFILE_NODE_MODULES,
  PROFILE_PACKAGE_NAME,
  profilePatchBody,
} from "./config.ts";
import type { SandboxPaths } from "./types.ts";

/** profile 清单：只声明 bundles，依赖全部由官方包解析提供。 */
export function profilePackageJson(bundles: readonly string[]): string {
  const useBundles = bundles.length ? bundles : DEFAULT_BUNDLES;
  return `${JSON.stringify({
    name: PROFILE_PACKAGE_NAME,
    private: true,
    dsh: { profile: { bundles: [...useBundles] } },
  }, null, 2)}\n`;
}

/** bundles 只接受合法包名；有非法项直接报错，不静默丢弃（否则调用方以为生效了）。 */
export function resolveBundles(bundles: readonly string[] | undefined): string[] {
  if (!bundles || bundles.length === 0) return [...DEFAULT_BUNDLES];
  const invalid = bundles.filter((item) => !PACKAGE_NAME.test(item));
  if (invalid.length > 0) {
    throw new SandboxError(`bundle 不是合法包名：${invalid.join(", ")}`, "invalid-bundle");
  }
  return [...bundles];
}

/** 建目录 + 写 profile 的两份文件；补丁层总是重写，把 policy 钉在 workspace。 */
export async function writeProfile(paths: SandboxPaths, bundles: readonly string[]): Promise<void> {
  await fsp.mkdir(paths.profileDir, { recursive: true });
  await fsp.mkdir(paths.workspace, { recursive: true });
  await fsp.mkdir(paths.agentsHome, { recursive: true });
  await fsp.writeFile(path.join(paths.profileDir, "package.json"), profilePackageJson(bundles));
  await fsp.writeFile(path.join(paths.profileDir, "cordis.patch.yml"), profilePatchBody(paths.workspace));
}

/** 显式传入的 key 走沙箱自己的 .env；工作环境凭据的继承见 writeInheritedCredentials。 */
export async function writeEnvFile(paths: SandboxPaths, apiKey: string | undefined): Promise<void> {
  if (!apiKey) return;
  await fsp.writeFile(path.join(paths.home, ENV_FILE), `${API_KEY_ENV}=${apiKey}\n`);
}

export type CredentialInheritance = "inherited" | "skipped";

/**
 * 模型凭据从工作环境继承：复制 .credentials.yaml，但剥掉 GUI 会话记录。
 * 沙箱启动时发现缺 browser-session 会自己生成一份，所以两边的 cookie 签名密钥互不相同；
 * deepseek-account-platform/* 与 refs 里的 API key 则原样带过去，沙箱不必再单独登录。
 * 快照只在创建时取一次，工作环境后续刷新 token 后重建沙箱即可。
 * 注意 device 记录里的 payload.id 也会一并继承，两个实例因此共用同一个设备标识；
 * 若服务端按设备维度做会话或风控，可能出现互踢。
 *
 * 边界：这是黑名单实现（剥一条），fail-closed 只保证「剥不掉就不继承」；
 * dsh 将来往 records 里新增的敏感记录类型不在它的保护范围内，那时要改成白名单。
 */
export async function writeInheritedCredentials(paths: SandboxPaths): Promise<CredentialInheritance> {
  const source = path.join(workHome(), CREDENTIALS_FILE);
  const text = await fsp.readFile(source, "utf8").catch(() => undefined);
  if (!text) return "skipped";
  const filtered = stripCredentialRecord(text, BROWSER_SESSION_RECORD);
  // 失败即放弃（fail-closed）：剥不掉就整份不继承，宁可沙箱没凭据，也不把 GUI 会话密钥带过去。
  if (filtered.includes(BROWSER_SESSION_RECORD)) return "skipped";
  if (!filtered.includes("records:") || !filtered.includes(PLATFORM_ACCOUNT_PREFIX)) return "skipped";
  await fsp.writeFile(path.join(paths.home, CREDENTIALS_FILE), filtered);
  return "inherited";
}

/** 按顶层 map 的缩进结构切块：只删除 id 等于 key 的那一块，其余原样保留。 */
function stripCredentialRecord(text: string, key: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    const entry = /^ {2}(\S.*):\s*$/.exec(line);
    if (entry) {
      skipping = entry[1] === key;
      if (skipping) continue;
    } else if (/^\S/.test(line)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

/** headless 的 API-key 路由读 .env；key 从继承来的 refs 里取，避免每次手工提供。 */
export async function writeCredentialEnv(paths: SandboxPaths): Promise<void> {
  // 显式给过 key 就不覆盖：create 里 writeEnvFile 写的那份优先。
  const envFile = path.join(paths.home, ENV_FILE);
  const exists = await fsp.access(envFile).then(() => true).catch(() => false);
  if (exists) return;
  const text = await fsp.readFile(path.join(paths.home, CREDENTIALS_FILE), "utf8").catch(() => undefined);
  if (!text) return;
  const key = /DEEPSEEK_API_KEY:\s*["']?([^"'\s]+)["']?/.exec(text)?.[1];
  if (!key) return;
  await fsp.writeFile(envFile, `${API_KEY_ENV}=${key}\n`);
}

/**
 * 官方包的模块解析。沙箱 profile 自己不带 node_modules，这里**逐个包**建 junction，
 * 借用工作环境的官方包投影（只含指向 dsh 安装的软链，不含用户数据）。
 *
 * 不能把整个 node_modules 目录 junction 过去：那样往沙箱里写包会穿透到真实 profile
 * 的依赖树（实测踩过）。scope 目录建成真实目录、内部逐包链接，沙箱里新增的包落在沙箱内。
 */
export async function ensureModuleResolution(paths: SandboxPaths): Promise<void> {
  const target = path.join(paths.home, "profiles", PROFILE_NODE_MODULES);
  const shared = path.join(workHome(), "profiles", PROFILE_NODE_MODULES);
  const available = await fsp.access(shared).then(() => true).catch(() => false);
  if (!available) return;

  // 旧版本建的是「整个 node_modules 目录」的 junction，写入会穿透到真实 profile。
  // 遇到这种遗留就拆掉重建，否则老实例照样污染工作环境。
  const existing = await fsp.lstat(target).catch(() => undefined);
  if (existing?.isSymbolicLink()) await fsp.unlink(target).catch(() => undefined);

  await fsp.mkdir(target, { recursive: true });

  const link = async (from: string, to: string): Promise<void> => {
    const exists = await fsp.access(to).then(() => true).catch(() => false);
    if (exists) return;
    await fsp.symlink(from, to, "junction").catch(() => undefined);
  };

  const entries = await fsp.readdir(shared, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const from = path.join(shared, entry.name);
    const to = path.join(target, entry.name);
    if (!entry.name.startsWith("@")) {
      await link(from, to);
      continue;
    }
    await fsp.mkdir(to, { recursive: true });
    const inner = await fsp.readdir(from, { withFileTypes: true }).catch(() => []);
    for (const pkg of inner) {
      await link(path.join(from, pkg.name), path.join(to, pkg.name));
    }
  }
}

export const currentProfileName = SANDBOX_PROFILE;
