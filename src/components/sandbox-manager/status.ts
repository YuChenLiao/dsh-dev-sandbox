import fsp from "node:fs/promises";
import path from "node:path";
import type { StatusResult } from "../../shared/types.ts";
import { portOpen } from "../../shared/process.ts";
import { listSessionFiles } from "../../shared/sessionLog.ts";
import { alive, requireRecord } from "./inspect.ts";
import type { ManagerContext } from "./types.ts";

const ERROR_LINE = /error|failed|cannot resolve|EADDRINUSE/i;

/** 客户端图只读一次首帧：沙箱实例的 /plugins/events 是 SSE，读完即断。 */
async function clientEntries(port: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/plugins/events`, { signal: controller.signal });
    const reader = response.body?.getReader();
    if (!reader) return [];
    let text = "";
    while (!text.includes('"entries"')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
      if (text.length > 1_000_000) break;
    }
    await reader.cancel().catch(() => undefined);
    const match = /data: (\{.*\})/.exec(text);
    const raw = match?.[1];
    if (!raw) return [];
    const graph = JSON.parse(raw) as { graph?: { entries?: { id?: string }[] } };
    return (graph.graph?.entries ?? []).map((entry) => entry.id ?? "").filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function readStatus(ctx: ManagerContext, id: string): Promise<StatusResult> {
  const record = await requireRecord(ctx, id);
  const up = alive(record.pid);
  const listening = up ? await portOpen(record.port) : false;

  let log = "";
  try {
    log = await fsp.readFile(record.logFile, "utf8");
  } catch {
    log = "";
  }
  const patch = await fsp
    .readFile(path.join(record.home, "profiles", record.profile, "cordis.patch.yml"), "utf8")
    .catch(() => "");
  const policy = /mode:\s*(\S+)/.exec(patch)?.[1] ?? "unknown";
  const errors = log
    .split("\n")
    .filter((line) => ERROR_LINE.test(line))
    .slice(-5)
    .map((line) => line.trim().slice(0, 240));

  return {
    id: record.id,
    alive: up,
    listening,
    port: record.port,
    pid: record.pid,
    bundles: record.bundles,
    sessions: listSessionFiles(record.home).length,
    policy,
    clientEntries: listening ? await clientEntries(record.port) : [],
    errors,
  };
}
