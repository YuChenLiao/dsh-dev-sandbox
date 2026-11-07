import fs from "node:fs";
import fsp from "node:fs/promises";
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

/**
 * 从事件数据里抽正文。三种形状都要处理：
 *   '纯字符串' / ContentBlock[] / { content } 或 { text } 的包装层。
 * 会话事件把正文放在 `data.message.content`，只处理前两种会得到空串。
 */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => textOf((part as { text?: unknown } | null)?.text)).join("");
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return textOf(record.content) || textOf(record.text);
  }
  return "";
}

function summarize(raw: unknown): SessionEventView {
  if (typeof raw !== "object" || raw === null) return { type: "unknown", text: "" };
  const event = raw as { type?: unknown; seq?: unknown; time?: unknown; data?: unknown };
  const data = (typeof event.data === "object" && event.data ? event.data : {}) as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "unknown";
  const base = {
    type,
    seq: typeof event.seq === "number" ? event.seq : undefined,
    at: typeof event.time === "number" ? event.time : null,
  };

  // 这两类事件的正文不在 text/content/message 三个字段上，按类型各自取：
  //   tool/call   → { name, arguments }，arguments 是模型原始输出的 JSON 字符串
  //   tool/result → { message: { content: ContentBlock[] }, isError? }
  if (type === "tool/call") {
    const name = String(data.name ?? "tool");
    // arguments 正常是模型原样输出的字符串；上游若改成对象，兜底成 JSON 而不是 [object Object]。
    const raw = data.arguments;
    const args = (typeof raw === "string" ? raw : JSON.stringify(raw ?? "")).replace(/\s+/g, " ");
    return { ...base, text: `${name}(${args.slice(0, 200)})`.slice(0, 240) };
  }
  if (type === "tool/result") {
    const message = (typeof data.message === "object" && data.message ? data.message : {}) as {
      content?: unknown;
      isError?: boolean;
    };
    // 失败标记有两种落法：外层的 error 对象，或消息自带的 isError。
    const prefix = data.error || message.isError ? "error: " : "";
    return { ...base, text: (prefix + textOf(message.content)).slice(0, 240) };
  }

  const text = textOf(data.text) || textOf(data.content) || textOf(data.message);
  return { ...base, text: text.slice(0, 240) };
}

const ZSTD_MAGIC = 0xfd2fb528;
const ZSTD_MAGIC_BYTES = [0x28, 0xb5, 0x2f, 0xfd];

interface FrameRange {
  start: number;
  end: number;
}

/**
 * 逐帧定位边界。算法与 DSH 自己的 `scanZstdFrames`
 * （`@deepseek-ai/dsh-session-persistence-jsonl` 的 zstd 模块）一致：
 * 魔数 → 帧头描述字节推出 content-size / dictionary / checksum 字段长度 → 逐块累积到 lastBlock。
 *
 * 与 DSH 的唯一差别是容错方向：它遇到结构损坏直接抛错，这里返回已经扫出来的完整帧，
 * 因为读的是别人写入中的文件，宁可少读一帧也不让整次读取失败。
 */
function scanFrames(buffer: Buffer): FrameRange[] {
  const frames: FrameRange[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) break;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break;
    offset += 4;
    if (offset === buffer.length) break;

    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) break;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) break;
    offset += remainingHeaderBytes;

    let torn = false;
    for (;;) {
      if (buffer.length - offset < 3) { torn = true; break; }
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) { torn = true; break; }
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) { torn = true; break; }
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (torn) break;
    if (checksum) {
      if (buffer.length - offset < 4) break;
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}

/**
 * 解压整个容器。会话文件是**多帧** zstd，`zstdDecompressSync` 只解第一帧——
 * 直接用它读真实文件只能拿到 `{"type":"session"}` 那一行 header。
 */
function decodeZstdFrames(raw: Buffer): Buffer {
  const parts: Buffer[] = [];
  for (const frame of scanFrames(raw)) {
    try {
      parts.push(zlib.zstdDecompressSync(raw.subarray(frame.start, frame.end)));
    } catch {
      // 单帧损坏（checksum 不符、字节被截断）只丢这一帧，不影响后续。
    }
  }
  return Buffer.concat(parts);
}

/** 未压缩的会话文件（旧格式）也能读：没有魔数就整份当明文。 */
function readContainer(raw: Buffer): Buffer {
  if (raw.length >= 4 && raw.readUInt32LE(0) === ZSTD_MAGIC) return decodeZstdFrames(raw);
  const at = raw.indexOf(Buffer.from(ZSTD_MAGIC_BYTES));
  if (at < 0) return raw;
  // 魔数前面若是有内容的文本，说明这不是「padding + 容器」，整份按明文读。
  const prefix = raw.subarray(0, at);
  const paddingOnly = prefix.every((byte) => byte === 0 || byte === 0x20 || byte === 0x0a || byte === 0x0d);
  if (!paddingOnly) return raw;
  // 像容器却一帧都解不出：给空，而不是把压缩字节当文本渲染成一屏乱码。
  const decoded = decodeZstdFrames(raw.subarray(at));
  return decoded.length > 0 ? decoded : Buffer.alloc(0);
}

/** 一次解码，行数与窗口都从同一份文本里取——避免同一文件解两遍。 */
export interface SessionPage {
  total: number;
  events: SessionEventView[];
}

export async function readSession(file: string, limit: number): Promise<SessionPage> {
  const raw = await fsp.readFile(file);
  const lines = readContainer(raw).toString("utf8").split("\n").filter(Boolean);
  const events: SessionEventView[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      events.push(summarize(JSON.parse(line)));
    } catch {
      events.push({ type: "unparsed", text: line.slice(0, 160) });
    }
  }
  return { total: lines.length, events };
}

export function newestSessionFile(home: string): string | undefined {
  return listSessionFiles(home)
    .map((file) => ({ file, at: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]?.file;
}
