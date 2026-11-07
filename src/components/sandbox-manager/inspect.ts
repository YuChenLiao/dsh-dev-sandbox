import fs from "node:fs";
import {
  countLines,
  newestSessionFile,
  readEvents,
} from "../../shared/sessionLog.ts";
import { portOpen } from "../../shared/process.ts";
import type {
  LogInput,
  LogResult,
  SandboxRecord,
  SandboxView,
  TailInput,
  TailResult,
} from "../../shared/types.ts";
import { listSessionFiles } from "../../shared/sessionLog.ts";
import type { ManagerContext } from "./types.ts";

export async function requireRecord(ctx: ManagerContext, id: string): Promise<SandboxRecord> {
  const state = await ctx.state.read();
  const record = state.sandboxes.find((item) => item.id === id || item.name === id);
  if (!record) throw new Error(`没有这个沙箱：${id}`);
  return record;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 列表：存活以端口为准、pid 只作辅助，避免 pid 复用误导。 */
export async function listSandboxes(ctx: ManagerContext): Promise<SandboxView[]> {
  const state = await ctx.state.read();
  const views: SandboxView[] = [];
  for (const record of state.sandboxes) {
    const up = alive(record.pid);
    views.push({
      id: record.id,
      name: record.name,
      port: record.port,
      token: record.token,
      pid: record.pid,
      alive: up,
      listening: up ? await portOpen(record.port) : false,
      sessions: listSessionFiles(record.home).length,
      bundles: record.bundles,
      createdAt: record.createdAt,
    });
  }
  return views;
}

/** 读沙箱对话：直接读它的会话落盘文件，沙箱进程不需要参与。 */
export async function readTail(ctx: ManagerContext, input: TailInput): Promise<TailResult> {
  const record = await requireRecord(ctx, input.id);
  const file = newestSessionFile(record.home);
  if (!file) return { sessions: 0, events: [] };
  const limit = Math.max(1, Math.min(200, input.limit ?? 24));
  return {
    sessions: listSessionFiles(record.home).length,
    session: file.split(/[\\/]/).slice(-2)[0],
    total: countLines(file),
    events: readEvents(file, limit),
  };
}

export async function readLog(ctx: ManagerContext, input: LogInput): Promise<LogResult> {
  const record = await requireRecord(ctx, input.id);
  const lines = Math.max(1, Math.min(500, input.lines ?? 40));
  let text = "";
  try {
    text = fs.readFileSync(record.logFile, "utf8");
  } catch {
    text = "";
  }
  return { text: text.split("\n").slice(-lines).join("\n") };
}
