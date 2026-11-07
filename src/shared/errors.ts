/** 面板与工具层统一抛出的错误类型，带稳定的 code 便于前端区分。 */
export class SandboxError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "SandboxError";
  }
}

export function asMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
