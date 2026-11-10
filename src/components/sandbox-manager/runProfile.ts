import fsp from "node:fs/promises";
import path from "node:path";
import type { McpEntry } from "../../shared/types.ts";
import type { SandboxPaths } from "./types.ts";
import { SANDBOX_PROFILE } from "../../shared/config.ts";
import {
  HEADLESS_BUNDLE,
  RUN_PROFILE,
  WEB_APP_BUNDLE,
  runProfilePatchBody,
} from "./config.ts";

/**
 * 准备一个只跑一次任务的 profile：base + headless + 待测插件。
 * 走 headless 而不是 web API，是因为较旧实例的 session/prompt 只把消息入队、不驱动 turn；
 * headless 直接跑完把答案打到 stdout，跨版本稳定。
 */
export async function ensureRunProfile(
  paths: SandboxPaths,
  bundles: readonly string[],
  mcp?: readonly McpEntry[],
  presetYaml?: string,
): Promise<void> {
  const dir = path.join(paths.home, "profiles", RUN_PROFILE);
  await fsp.mkdir(dir, { recursive: true });

  const plugins = bundles.filter((item) => item !== WEB_APP_BUNDLE);
  const list = [...new Set(["@deepseek-ai/dsh-base", HEADLESS_BUNDLE, ...plugins])];
  await fsp.writeFile(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: `dsh-profile-${RUN_PROFILE}`, private: true, dsh: { profile: { bundles: list } } }, null, 2)}\n`,
  );
  // MCP 行两套补丁都要有：只写 web profile 的话，headless 跑对话时看不到。
  // 物化的 preset 行同理。
  await fsp.writeFile(path.join(dir, "cordis.patch.yml"), runProfilePatchBody(paths.workspace, mcp, presetYaml));

  // 复用 web 侧的 node_modules：待测插件已经 junction 在那里，不必再装一遍。
  const link = path.join(dir, "node_modules");
  const shared = path.join(paths.home, "profiles", SANDBOX_PROFILE, "node_modules");
  const linked = await fsp.access(link).then(() => true).catch(() => false);
  const available = await fsp.access(shared).then(() => true).catch(() => false);
  if (!linked && available) await fsp.symlink(shared, link, "junction").catch(() => undefined);
}
