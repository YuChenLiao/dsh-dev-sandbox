import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_BODY_BYTES } from "./config.ts";
import { SandboxError } from "./errors.ts";

export function sendJson(res: ServerResponse, code: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** 读 JSON 请求体，超过上限直接拒绝，避免面板把宿主内存打满。 */
export function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        fail(new SandboxError("请求体过大", "body-too-large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) return done({});
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return fail(new SandboxError("请求体必须是对象", "body-not-object"));
        }
        done(parsed as Record<string, unknown>);
      } catch {
        fail(new SandboxError("请求体不是合法 JSON", "body-not-json"));
      }
    });
    req.on("error", (error) => fail(error));
  });
}
