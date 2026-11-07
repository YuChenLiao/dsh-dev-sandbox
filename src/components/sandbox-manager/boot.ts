import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import {
  BOOT_FAILURE_PATTERN,
  BOOT_TIMEOUT_MS,
  LISTEN_URL_PATTERN,
  READY_TIMEOUT_MS,
} from "../../shared/config.ts";
import { SandboxError } from "../../shared/errors.ts";
import { portOpen, sleep, spawnDsh, killTree } from "../../shared/process.ts";
import { BOOT_ARGS } from "./config.ts";
import type { SandboxPaths } from "./types.ts";

export interface BootedSandbox {
  child: ChildProcess;
  buffer: () => string;
  port: number;
  token: string;
  ready: boolean;
}

/**
 * 启动一个沙箱实例。
 * 日志用 pipe 收集而不是继承 fd：桌面宿主（Electron 的 node 模式）不保证 fd 继承，
 * 之前正是因为这一点拿不到启动地址。
 */
export async function boot(paths: SandboxPaths, env: NodeJS.ProcessEnv): Promise<BootedSandbox> {
  fs.writeFileSync(paths.logFile, "");
  const child = spawnDsh([...BOOT_ARGS], { cwd: paths.workspace, env, stdio: ["ignore", "pipe", "pipe"] });

  let buffer = "";
  const collect = (chunk: unknown): void => {
    const text = String(chunk);
    buffer += text;
    try {
      fs.appendFileSync(paths.logFile, text);
    } catch {
      // 日志写失败不影响启动判定
    }
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);

  try {
    const { port, token } = await waitForUrl(() => buffer);
    const ready = await waitForReady(port, token);
    return { child, buffer: () => buffer, port, token, ready };
  } catch (error) {
    killTree(child.pid);
    throw error;
  }
}

/** 从启动输出里解析宿主报告的地址；命中失败特征就提前退出，不必等满 90 秒。 */
async function waitForUrl(read: () => string): Promise<{ port: number; token: string }> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const text = read();
    const match = text.match(LISTEN_URL_PATTERN);
    if (match?.[1] && match[2]) return { port: Number(match[1]), token: match[2] };
    if (BOOT_FAILURE_PATTERN.test(text)) {
      throw new SandboxError(`沙箱启动失败：${tail(text)}`, "boot-failed");
    }
    await sleep(300);
  }
  throw new SandboxError("沙箱在 90 秒内没有报告监听地址", "boot-timeout");
}

async function waitForReady(port: number, token: string): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await portOpen(port)) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, { redirect: "manual" });
        if (response.status < 500) return true;
      } catch {
        // 还没起来
      }
    }
    await sleep(400);
  }
  return false;
}

function tail(text: string): string {
  return text.trim().split("\n").slice(-3).join(" | ");
}
