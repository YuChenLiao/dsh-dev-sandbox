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
    const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    // 不监听 error 的话，spawn 一个不存在的可执行文件会以未捕获的 error 事件把宿主一起带崩；
    // 这里只要降级成「杀不掉」，调用方读端口/pid 会发现并报错。
    child.on("error", () => undefined);
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
 * 解析 dsh 的 bin.js。顺序：显式变量 → 宿主自己就是 bin.js → PATH 上的 npm 全局布局。
 * argv[1] 分支要回读同级 package.json 确认 name，否则「包名恰好叫 dsh」的布局会误命中。
 */
export function dshBinPath(): string {
  const explicit = process.env.DSH_SANDBOX_DSH_BIN;
  if (explicit) return explicit;

  const self = process.argv[1];
  if (self && /[\\/]dsh[\\/]lib[\\/]bin\.js$/.test(self) && fs.existsSync(self) && isDshPackage(self)) {
    return self;
  }

  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new SandboxError(
    "找不到 dsh 的 bin.js：设 DSH_SANDBOX_DSH_BIN 指向 @deepseek-ai/dsh/lib/bin.js"
    + "（桌面版的副本在 app.asar 里，需要显式指定路径）",
    "dsh-bin-missing",
  );
}

/** bin.js 在 <pkg>/lib/ 下，回读上一级 package.json 确认这就是 @deepseek-ai/dsh。 */
function isDshPackage(binPath: string): boolean {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(binPath), "..", "package.json"), "utf8")) as {
      name?: string;
    };
    return manifest.name === "@deepseek-ai/dsh";
  } catch {
    return false;
  }
}

/**
 * 选一个真正的 node 来跑 bin.js。桌面宿主的 process.execPath 是 Electron 二进制，
 * 实测用它跑 bin.js 会在启动早期崩掉，所以找不到 node 时直接报错而不是退回它。
 */
function nodeExecutable(): string {
  const explicit = process.env.DSH_SANDBOX_DSH_NODE;
  if (explicit) return explicit;
  const names = process.platform === "win32" ? ["node.exe", "node.cmd"] : ["node"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new SandboxError("PATH 上找不到 node，无法启动 dsh", "node-missing");
}

/** 给 boot.log 用的运行期信息：谁在跑 bin.js、跑的是哪份 dsh。 */
export function runtimeDescription(): string {
  return `node=${nodeExecutable()} dsh=${dshBinPath()}`;
}

export interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio?: ["ignore", "pipe", "pipe"] | "inherit";
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
