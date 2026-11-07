import fsp from "node:fs/promises";
import path from "node:path";
import { PACKAGE_NAME } from "../../shared/config.ts";
import { SandboxError } from "../../shared/errors.ts";
import { insidePath } from "../../shared/paths.ts";
import type { InstallInput, InstallResult } from "../../shared/types.ts";
import { PROFILE_NODE_MODULES } from "./config.ts";
import { requireRecord } from "./inspect.ts";
import type { ManagerContext } from "./types.ts";

/**
 * 只搜工作区，不接受任意路径。
 * 包名先过正则：它要拼进文件系统路径并且会被递归删除，不能带 `..` 或分隔符。
 */
async function resolveSource(pkg: string): Promise<string> {
  const cwd = process.cwd();
  const short = pkg.split("/").pop() ?? pkg;
  const candidates = [
    path.join(cwd, "node_modules", ...pkg.split("/")),
    path.join(cwd, short),
    path.join(cwd, "packages", short),
  ];
  for (const dir of candidates) {
    const text = await fsp.readFile(path.join(dir, "package.json"), "utf8").catch(() => undefined);
    if (!text) continue;
    try {
      if ((JSON.parse(text) as { name?: string }).name === pkg) return dir;
    } catch {
      // 不是合法 package.json，跳过
    }
  }
  throw new SandboxError(`找不到 ${pkg} 的源码目录（试过工作区的 node_modules、包名目录、packages/）`, "package-not-found");
}

/**
 * 把工作区的插件装进沙箱：junction 到沙箱 profile 自己的 node_modules，再加一行 bundle。
 * 目标路径必须落在 profile 目录内，否则只删不建也可能造成越界破坏。
 */
export async function installPackage(ctx: ManagerContext, input: InstallInput): Promise<InstallResult> {
  const name = (input.package ?? "").trim();
  if (!PACKAGE_NAME.test(name)) throw new SandboxError(`包名不合法：${name}`, "invalid-package-name");

  const record = await requireRecord(ctx, input.id);
  const source = await resolveSource(name);
  const profileDir = path.join(record.home, "profiles", record.profile);
  const link = insidePath(profileDir, path.join(profileDir, PROFILE_NODE_MODULES, ...name.split("/")));

  await fsp.mkdir(path.dirname(link), { recursive: true });
  await fsp.rm(link, { recursive: true, force: true });
  await fsp.symlink(source, link, "junction");

  const packageFile = path.join(profileDir, "package.json");
  const manifest = JSON.parse(await fsp.readFile(packageFile, "utf8")) as {
    dsh?: { profile?: { bundles?: string[] } };
  };
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  if (!bundles.includes(name)) bundles.push(name);
  manifest.dsh = { ...(manifest.dsh ?? {}), profile: { ...(manifest.dsh?.profile ?? {}), bundles } };
  await fsp.writeFile(packageFile, `${JSON.stringify(manifest, null, 2)}\n`);

  await ctx.state.update((state) => {
    const target = state.sandboxes.find((item) => item.id === record.id);
    if (target) target.bundles = bundles;
  });

  return { package: name, source, bundles, requiresReload: true };
}
