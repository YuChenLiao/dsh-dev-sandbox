import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { KEEP_ENV, PROBE_TIMEOUT_MS } from "./config.ts";
import { SandboxError } from "./errors.ts";

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

/**
 * 解析 dsh 的 bin.js。找不到就报错，绝不再退回 cmd.exe —— 参数里有模型给的文本，
 * 过 shell 会把 & | > 之类的字符当命令解释。
 */
export function dshBinPath(): string {
  const explicit = process.env.DSH_SANDBOX_DSH_BIN;
  if (explicit) return explicit;
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new SandboxError("找不到 dsh 的 bin.js，请设置 DSH_SANDBOX_DSH_BIN 指向 @deepseek-ai/dsh/lib/bin.js", "dsh-bin-missing");
}

export interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio?: ["ignore", "pipe", "pipe"] | "inherit";
}

/**
 * 选一个真正的 node 来跑 bin.js。桌面宿主的 process.execPath 是 Electron 二进制，
 * 虽然 ELECTRON_RUN_AS_NODE 能跑，但它内置的 node 版本与 CLI 安装不一定对得上，
 * 实测会在启动早期崩掉；PATH 上装了 node 就优先用它。
 */
function nodeExecutable(): string {
  const names = process.platform === "win32" ? ["node.exe", "node.cmd"] : ["node"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return process.execPath;
}

/** 启动 dsh：永远用 node 直接执行 bin.js，参数作为 argv 传递，不经过任何 shell。 */
export function spawnDsh(args: string[], options: SpawnOptions): ChildProcess {
  const stdio = options.stdio ?? ["ignore", "pipe", "pipe"];
  const env = { ...options.env, ELECTRON_RUN_AS_NODE: "1" };
  return spawn(nodeExecutable(), [dshBinPath(), ...args], { ...options, env, stdio, windowsHide: true });
}

export interface CommandResult {
  code: number | null;
  out: string;
  err: string;
}

/** 跑一次短命令并收集输出，超时就杀树。 */
export function runCommand(args: string[], options: SpawnOptions, timeoutMs: number): Promise<CommandResult> {
  return new Promise((done, fail) => {
    let child: ChildProcess;
    try {
      child = spawnDsh(args, options);
    } catch (error) {
      fail(error);
      return;
    }
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => { out += String(d); });
    child.stderr?.on("data", (d) => { err += String(d); });
    const timer = setTimeout(() => {
      killTree(child.pid);
      done({ code: null, out, err });
    }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); fail(error); });
    child.on("close", (code) => { clearTimeout(timer); done({ code, out, err }); });
  });
}
