import type { CompareInput, CompareResult, CompareSide, PromptResult } from "../../shared/types.ts";
import { asMessage } from "../../shared/errors.ts";
import { promptSandbox } from "./prompt.ts";
import type { ManagerContext } from "./types.ts";

/**
 * 两边跑同一句话并排对比。
 *
 * 并行是安全的：两个实例有各自的 home、端口和进程，`promptSandbox` 之间没有共享可变状态，
 * 唯一共同的写入点是账本，而账本本身有串行队列。
 */
export async function compareSandboxes(ctx: ManagerContext, input: CompareInput): Promise<CompareResult> {
  const text = input.text.trim();
  const run = async (id: string, session?: string): Promise<CompareSide> => {
    try {
      const result: PromptResult = await promptSandbox(ctx, {
        id,
        text,
        ...(session ? { session } : {}),
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      });
      return {
        id,
        ok: true,
        assistant: result.assistant,
        session: result.session,
        tools: result.tools,
        events: result.events,
      };
    } catch (error) {
      return { id, ok: false, assistant: "", session: "", tools: [], events: 0, error: asMessage(error) };
    }
  };

  const [a, b] = await Promise.all([run(input.a, input.sessionA), run(input.b, input.sessionB)]);

  return {
    text,
    a,
    b,
    identical: a.ok && b.ok && a.assistant === b.assistant,
  };
}
