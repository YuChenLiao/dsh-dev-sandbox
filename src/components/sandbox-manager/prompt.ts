import path from "node:path";
import { SandboxError } from "../../shared/errors.ts";
import { runCommand, sandboxEnv } from "../../shared/process.ts";
import { newestSessionFile, readSession } from "../../shared/sessionLog.ts";
import type { PromptInput, PromptResult } from "../../shared/types.ts";
import { RUN_PROFILE } from "./config.ts";
import { requireRecord } from "./inspect.ts";
import { instancePaths } from "./lifecycle.ts";
import { writeCredentialEnv } from "./profile.ts";
import { ensureRunProfile } from "./runProfile.ts";
import type { ManagerContext } from "./types.ts";

/**
 * 在沙箱里真跑一轮：headless profile 跑完把答案打到 stdout，工具名从落盘事件里摘。
 * 不走 web API 的原因见 runProfile.ts 的注释：旧实例的 session/prompt 只入队不驱动。
 * 会话 cwd 固定为沙箱 workspace，不接受调用方传路径。
 *
 * 传 `session` 时用 headless 的 `--session-id` 续接同一会话（实测可续，模型记得上一轮）；
 * 它的前提是 cwd 一致且该会话没有 agent preset，我们的 run profile 两条都满足。
 */
export async function promptSandbox(ctx: ManagerContext, input: PromptInput): Promise<PromptResult> {
  const record = await requireRecord(ctx, input.id);
  const text = input.text.trim();
  if (!text) throw new SandboxError("消息内容为空", "empty-prompt");

  const paths = instancePaths(ctx.root, record.id);
  await ensureRunProfile(paths, record.bundles, record.mcp);
  // 幂等补齐：老实例创建时还没有这一步，第一次跑对话时补上。
  await writeCredentialEnv(paths);

  const session = input.session?.trim();
  const args = ["--profile", RUN_PROFILE];
  if (session) args.push("--session-id", session);
  args.push(text);

  const result = await runCommand(
    args,
    { cwd: record.workspace, env: sandboxEnv(record.home, paths.agentsHome), stdio: ["ignore", "pipe", "pipe"] },
    input.timeoutMs ?? 180_000,
  );

  const assistant = result.out.trim();
  const latest = newestSessionFile(record.home);
  const events = latest ? (await readSession(latest, 400)).events : [];
  const tools = [...new Set(events.filter((event) => event.type.startsWith("tool/")).map((event) => event.type))];

  if (result.code !== 0 && !assistant) {
    const detail = (result.err || "").trim().split("\n").slice(-3).join(" | ");
    throw new SandboxError(`沙箱对话失败：${detail || "没有输出"}`, "prompt-failed");
  }

  return {
    session: latest ? path.basename(path.dirname(latest)) : "",
    assistant,
    tools,
    reason: result.code === 0 ? "idle" : "timeout",
    events: events.length,
  };
}
