import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { SandboxError } from "./errors.ts";

/** 沙箱根目录：所有实例都在它下面，工具只能碰这个子树。 */
export function resolveRoot(explicit?: string): string {
  const raw = explicit ?? process.env.DSH_SANDBOX_ROOT ?? join(homedir(), ".dsh-dev-sandbox", "instances");
  return resolve(raw);
}

/** 把路径钉进根目录；越界直接抛错，这是"工具能删目录"的最后一道闸。 */
export function insidePath(root: string, target: string): string {
  const base = resolve(root) + sep;
  const real = resolve(target);
  if (!real.startsWith(base) && real !== resolve(root)) {
    throw new SandboxError(`路径越界：${real}`, "path-outside-root");
  }
  return real;
}

/** 工作环境的 DSH home，用于借用官方包的模块解析。 */
export function workHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
