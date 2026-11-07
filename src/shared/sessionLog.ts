import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { SessionEventView } from "./types.ts";

// 版本后缀可有可无：0.2.x 落 session.v4.jsonl.zstd，较旧的实例落 session.jsonl.zstd。
const SESSION_FILE = /^session(\.[\w-]+)?\.jsonl(\.zstd)?$/;

/** 会话按 cwd 分桶存放：sessions/<escaped-cwd>/<session-id>/session.v*.jsonl.zstd */
export function listSessionFiles(home: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SESSION_FILE.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(home, "sessions"));
  return files;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => (typeof part === "object" && part && "text" in part
      ? String((part as { text?: unknown }).text ?? "") : "")).join("");
  }
  return "";
}

function summarize(raw: unknown): SessionEventView {
  if (typeof raw !== "object" || raw === null) return { type: "unknown", text: "" };
  const event = raw as { type?: unknown; seq?: unknown; time?: unknown; data?: unknown };
  const data = (typeof event.data === "object" && event.data ? event.data : {}) as Record<string, unknown>;
  const text = textOf(data.text) || textOf(data.content) || textOf(data.message);
  return {
    type: typeof event.type === "string" ? event.type : "unknown",
    seq: typeof event.seq === "number" ? event.seq : undefined,
    at: typeof event.time === "number" ? event.time : null,
    text: text.slice(0, 240),
  };
}

/** 读最近一个会话文件的后 N 条事件；zstd 与明文 JSONL 都支持。 */
export function readEvents(file: string, limit: number): SessionEventView[] {
  const raw = fs.readFileSync(file);
  const buffer = file.endsWith(".zstd") ? zlib.zstdDecompressSync(raw) : raw;
  const lines = buffer.toString("utf8").split("\n").filter(Boolean);
  const events: SessionEventView[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      events.push(summarize(JSON.parse(line)));
    } catch {
      events.push({ type: "unparsed", text: line.slice(0, 160) });
    }
  }
  return events;
}

export function countLines(file: string): number {
  const raw = fs.readFileSync(file);
  const buffer = file.endsWith(".zstd") ? zlib.zstdDecompressSync(raw) : raw;
  return buffer.toString("utf8").split("\n").filter(Boolean).length;
}

export function newestSessionFile(home: string): string | undefined {
  return listSessionFiles(home)
    .map((file) => ({ file, at: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]?.file;
}
