import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { KEEP_ENV, PROBE_TIMEOUT_MS } from "./config.ts";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 结束一整棵进程树：dsh 自己会 spawn 工具进程，只杀父进程会留孤儿端口。 */
export function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  } catch {
    // 进程已经没了
  }
}

export function portOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => done(false));
    socket.once("timeout", () => { socket.destroy(); done(false); });
  });
}

/**
 * 子进程环境：丢掉宿主所有 DSH_* 变量（尤其 SESSION_ID / WEB_URL / PROFILE），
 * 只保留运行所需的系统变量，再显式给出沙箱自己的 home。
 */
export function sandboxEnv(home: string, agentsHome: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("DSH_")) continue;
    if (KEEP_ENV.has(key)) out[key] = value;
  }
  out.DSH_HOME = home;
  out.DSH_AGENTS_HOME = agentsHome;
  out.NO_COLOR = "1";
  out.FORCE_COLOR = "0";
  return out;
}

export interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio?: ["ignore", "pipe", "pipe"] | "inherit";
}

/** 启动 dsh：优先用显式指定的 bin.js，否则走 PATH 上的 dsh 命令。 */
export function spawnDsh(args: string[], options: SpawnOptions): ChildProcess {
  const bin = process.env.DSH_SANDBOX_DSH_BIN;
  const stdio = options.stdio ?? ["ignore", "pipe", "pipe"];
  if (bin) {
    // 桌面宿主是 Electron 二进制，用它跑 bin.js 必须先进 node 模式。
    const env = { ...options.env, ELECTRON_RUN_AS_NODE: "1" };
    return spawn(process.execPath, [bin, ...args], { ...options, env, stdio, windowsHide: true });
  }
  const comspec = process.env.ComSpec ?? "cmd.exe";
  return spawn(comspec, ["/d", "/s", "/c", `dsh ${args.join(" ")}`], { ...options, stdio, windowsHide: true });
}

export interface CommandResult {
  code: number | null;
  out: string;
  err: string;
}

/** 跑一次短命令并收集输出，超时就杀树。 */
export function runCommand(args: string[], options: SpawnOptions, timeoutMs: number): Promise<CommandResult> {
  return new Promise((done) => {
    const child = spawnDsh(args, options);
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => { out += String(d); });
    child.stderr?.on("data", (d) => { err += String(d); });
    const timer = setTimeout(() => {
      killTree(child.pid);
      done({ code: null, out, err });
    }, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); done({ code, out, err }); });
  });
}
