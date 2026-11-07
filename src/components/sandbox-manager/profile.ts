import fsp from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BUNDLES, SANDBOX_PROFILE } from "../../shared/config.ts";
import { workHome } from "../../shared/paths.ts";
import {
  API_KEY_ENV,
  ENV_FILE,
  PROFILE_NODE_MODULES,
  PROFILE_PACKAGE_NAME,
  PROFILE_PATCH_BODY,
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

export function resolveBundles(bundles: readonly string[] | undefined): string[] {
  return bundles && bundles.length ? [...bundles] : [...DEFAULT_BUNDLES];
}

/** 建目录 + 写 profile 的两份文件；profile 层永远是空补丁。 */
export async function writeProfile(paths: SandboxPaths, bundles: readonly string[]): Promise<void> {
  await fsp.mkdir(paths.profileDir, { recursive: true });
  await fsp.mkdir(paths.workspace, { recursive: true });
  await fsp.mkdir(paths.agentsHome, { recursive: true });
  await fsp.writeFile(path.join(paths.profileDir, "package.json"), profilePackageJson(bundles));
  const patch = path.join(paths.profileDir, "cordis.patch.yml");
  const exists = await fsp.access(patch).then(() => true).catch(() => false);
  if (!exists) await fsp.writeFile(patch, PROFILE_PATCH_BODY);
}

/** 模型凭据只经过沙箱自己的 .env，绝不复制工作环境的 .credentials.yaml。 */
export async function writeEnvFile(paths: SandboxPaths, apiKey: string | undefined): Promise<void> {
  if (!apiKey) return;
  await fsp.writeFile(path.join(paths.home, ENV_FILE), `${API_KEY_ENV}=${apiKey}\n`);
}

/**
 * 官方包的模块解析。沙箱 profile 自己不带 node_modules，
 * 这里借用工作环境的官方包投影（只含指向 dsh 安装的软链，不含用户数据）。
 */
export async function ensureModuleResolution(paths: SandboxPaths): Promise<void> {
  const link = path.join(paths.home, "profiles", PROFILE_NODE_MODULES);
  const shared = path.join(workHome(), "profiles", PROFILE_NODE_MODULES);
  const linked = await fsp.access(link).then(() => true).catch(() => false);
  if (linked) return;
  const available = await fsp.access(shared).then(() => true).catch(() => false);
  if (!available) return;
  await fsp.symlink(shared, link, "junction").catch(() => undefined);
}

export const currentProfileName = SANDBOX_PROFILE;
