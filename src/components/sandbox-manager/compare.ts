import type { CompareInput, CompareResult, CompareSide, PromptResult, SessionEventView } from "../../shared/types.ts";
import { asMessage } from "../../shared/errors.ts";
import { promptSandbox } from "./prompt.ts";
import { readTail } from "./inspect.ts";
import type { ManagerContext } from "./types.ts";

/**
 * 从会话事件里把 tool/call 与紧随其后的 tool/result 配成对。
 * `sandbox_tail` 的摘要已经是 `name(args)` 形式，直接拿来用，不重新解析。
 */
function pairCalls(events: SessionEventView[]): Array<{ name: string; call: string; result: string }> {
  const calls: Array<{ name: string; call: string; result: string }> = [];
  let pending: { name: string; call: string } | undefined;
  for (const event of events) {
    if (event.type === "tool/call") {
      const name = event.text.slice(0, event.text.indexOf("(") < 0 ? 32 : event.text.indexOf("("));
      pending = { name, call: event.text };
      continue;
    }
    if (event.type === "tool/result" && pending) {
      calls.push({ ...pending, result: event.text });
      pending = undefined;
    }
  }
  if (pending) calls.push({ ...pending, result: "" });
  return calls;
}

/**
 * 两边跑同一句话并排对比。
 *
 * 并行是安全的：两个实例有各自的 home、端口和进程，`promptSandbox` 之间没有共享可变状态，
 * 唯一共同的写入点是账本，而账本本身有串行队列。
 *
 * 除了助手文本，还各带回一份工具调用列表——插件的差异经常不体现在回答里，
 * 而是「多调了一个工具」或「调了不同的工具」，只看文本会漏掉这个信号。
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
      let calls: CompareSide["calls"] = [];
      try {
        // 按这一轮实际用的会话读，不能用 newestSessionFile：续接旧会话时最新文件是另一个人的。
        const page = await readTail(ctx, { id, session: result.session, limit: 120 });
        calls = pairCalls(page.events);
      } catch {
        calls = [];
      }
      return {
        id,
        ok: true,
        assistant: result.assistant,
        session: result.session,
        tools: result.tools,
        calls,
        events: result.events,
      };
    } catch (error) {
      return {
        id,
        ok: false,
        assistant: "",
        session: "",
        tools: [],
        calls: [],
        events: 0,
        error: asMessage(error),
      };
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
