/**
 * 面板与工具层统一抛出的错误类型。
 * code 拼进消息：模型只看到 `Error: <message>`，不拼进去它就拿不到这个分类。
 * raw 为 true 时不再加前缀——用于包一层已经带 code 的错误，避免 `[a] [b] …` 嵌套。
 */
export class SandboxError extends Error {
  constructor(message: string, readonly code: string, raw = false) {
    super(raw ? message : `[${code}] ${message}`);
    this.name = "SandboxError";
  }
}

export function asMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
