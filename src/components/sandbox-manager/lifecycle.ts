import fsp from "node:fs/promises";
import path from "node:path";
import { PORT_RELEASE_TIMEOUT_MS, SANDBOX_PROFILE, TRASH_PREFIX } from "../../shared/config.ts";
import { asMessage, SandboxError } from "../../shared/errors.ts";
import { insidePath } from "../../shared/paths.ts";
import { killTree, portOpen, sandboxEnv, sleep } from "../../shared/process.ts";import type { CreateSandboxInput, DestroyInput, DestroyResult, LifecycleInput, SandboxRecord, StartResult, StopResult } from "../../shared/types.ts";
import { boot } from "./boot.ts";
import {
  HOME_DIR,
  INSTANCE_ID_LENGTH,
  INSTANCE_ID_PREFIX,
  LOG_FILE,
  PROFILE_AGENTS_DIR,
  PROFILE_DIR,
  WORKSPACE_DIR,
} from "./config.ts";
import { ensureModuleResolution, resolveBundles, writeCredentialEnv, writeEnvFile, writeInheritedCredentials, writeProfile } from "./profile.ts";
import { requireRecord, alive } from "./inspect.ts";
import type { ManagerContext, SandboxPaths } from "./types.ts";

export function newInstanceId(): string {
  return `${INSTANCE_ID_PREFIX}${Math.random().toString(16).slice(2, 2 + INSTANCE_ID_LENGTH)}`;
}

export function instancePaths(root: string, id: string): SandboxPaths {
  const dir = insidePath(root, path.join(root, id));
  const home = path.join(dir, HOME_DIR);
  return {
    dir,
    home,
    workspace: path.join(dir, WORKSPACE_DIR),
    profileDir: path.join(home, PROFILE_DIR, SANDBOX_PROFILE),
    logFile: path.join(dir, LOG_FILE),
    agentsHome: path.join(dir, PROFILE_AGENTS_DIR),
  };
}

/** 新建：建目录、写 profile、起进程、等就绪、记账本；任何一步失败都把目录和进程收干净。 */
export async function createSandbox(ctx: ManagerContext, input: CreateSandboxInput): Promise<SandboxRecord> {
  const id = newInstanceId();
  const paths = instancePaths(ctx.root, id);
  const bundles = resolveBundles(input.bundles);
  const env = sandboxEnv(paths.home, paths.agentsHome);

  try {
    await writeProfile(paths, bundles);
    await writeEnvFile(paths, input.apiKey);
    const credentials = await writeInheritedCredentials(paths);
    if (credentials === "inherited") await writeCredentialEnv(paths);
    await ensureModuleResolution(paths);

    const booted = await boot(paths, env);
    // fail-closed 是静默的，留一行观测点：沙箱里模型鉴权失败时能立刻分辨是不是没继承。
    await fsp.appendFile(paths.logFile, `[sandbox] credentials: ${credentials}\n`)
      .catch((error: unknown) => console.error("[sandbox] 写 credentials 观测行失败", error));
    const record: SandboxRecord = {
      id,
      name: input.name?.trim() || id,
      home: paths.home,
      workspace: paths.workspace,
      logFile: paths.logFile,
      profile: SANDBOX_PROFILE,
      bundles,
      port: booted.port,
      token: booted.token,
      pid: booted.child.pid ?? 0,
      createdAt: Date.now(),
      ready: booted.ready,
    };
    await ctx.state.update((state) => {
      state.sandboxes.push(record);
    });
    return record;
  } catch (error) {
    // boot 已结束自己的进程树，这里收目录；失败现场并入错误信息，否则排障只能靠猜。
    const log = await fsp.readFile(paths.logFile, "utf8").catch(() => "");
    await sleep(600);
    await fsp.rm(paths.dir, { recursive: true, force: true, maxRetries: 4 }).catch(() => undefined);
    if (!log.trim()) throw error;
    // 内层多半已经是带 code 的 SandboxError，再套一层只会得到 `[create-failed] [boot-failed] …`。
    throw new SandboxError(`${asMessage(error)}\n--- boot.log ---\n${log.trim().split("\n").slice(-40).join("\n")}`, "create-failed", true);
  }
}

/** 停止：只结束进程并释放端口；home、profile、对话全部保留，之后可以再启动。 */
export async function stopSandbox(ctx: ManagerContext, input: LifecycleInput): Promise<StopResult> {
  const record = await requireRecord(ctx, input.id);

  // 已经停过就别再等一轮端口：killTree(0) 是空操作，而 record.port 可能已被别的进程占用。
  if (!record.pid) {
    return { stopped: record.id, portClosed: !(await portOpen(record.port)) };
  }

  killTree(record.pid);
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline && (await portOpen(record.port))) await sleep(250);
  const portClosed = !(await portOpen(record.port));

  // 端口没释放说明进程还活着。此时清 pid 会丢掉唯一句柄，之后 stop/start/destroy 都定位不到它。
  if (!portClosed) {
    throw new SandboxError(
      `进程没有结束：端口 ${record.port} 仍被占用，已保留 pid ${record.pid} 以便重试。`
      + `再 stop 一次；或用 taskkill /PID ${record.pid} /T /F 手动结束；或直接 destroy 丢弃这个实例。`,
      "stop-incomplete",
    );
  }

  await ctx.state.update((next) => {
    const target = next.sandboxes.find((item) => item.id === record.id);
    if (!target) return;
    target.pid = 0;
    target.ready = false;
  });
  return { stopped: record.id, portClosed };
}

/**
 * 启动：用已有目录与 profile 重新起进程。
 * 失败时保持停止状态并把 boot.log 尾部并入错误，避免「点了没反应」。
 */
export async function startSandbox(ctx: ManagerContext, input: LifecycleInput): Promise<StartResult> {
  const record = await requireRecord(ctx, input.id);

  // 已经在跑就别再起第二个：同一个 DSH_HOME 起两个进程，旧的会变孤儿，两个进程还会抢同一份会话与设置。
  // 只在 pid > 0 时探端口：pid=0 意味着停过，而那个端口可能已被别的程序拿走，探它只会误拒。
  if (record.pid && (alive(record.pid) || await portOpen(record.port))) {
    throw new SandboxError("实例已在运行；要重启请先 stop", "already-running");
  }

  const paths = instancePaths(ctx.root, record.id);
  const env = sandboxEnv(paths.home, paths.agentsHome);

  try {
    const booted = await boot(paths, env);
    const pid = booted.child.pid ?? 0;
    try {
      await ctx.state.update((next) => {
        const target = next.sandboxes.find((item) => item.id === record.id);
        if (!target) return;
        target.pid = pid;
        target.port = booted.port;
        target.token = booted.token;
        target.ready = booted.ready;
      });
    } catch (error) {
      // 记账失败就先把刚起来的进程收掉，否则它没有句柄，谁也停不了。
      killTree(pid);
      throw error;
    }
    return { started: record.id, port: booted.port, token: booted.token, pid, ready: booted.ready };
  } catch (error) {
    const log = await fsp.readFile(paths.logFile, "utf8").catch(() => "");
    throw new SandboxError(
      `${asMessage(error)}\n--- boot.log ---\n${log.trim().split("\n").slice(-40).join("\n")}`,
      "start-failed",
      true,
    );
  }
}

/** 销毁：杀整棵进程树、等端口释放、先改名再删（Windows 上直接删会被占用挡住）。 */
export async function destroySandbox(ctx: ManagerContext, input: DestroyInput): Promise<DestroyResult> {
  const state = await ctx.state.read();
  const record = state.sandboxes.find((item) => item.id === input.id || item.name === input.id);
  if (!record) throw new Error(`没有这个沙箱：${input.id}`);

  killTree(record.pid);
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline && (await portOpen(record.port))) await sleep(250);

  const trash = insidePath(ctx.root, path.join(ctx.root, `${TRASH_PREFIX}${path.basename(record.home)}-${Date.now()}`));
  const instanceDir = path.dirname(record.home);
  const exists = await fsp.access(instanceDir).then(() => true).catch(() => false);
  if (exists) {
    await fsp.rename(instanceDir, trash).catch(() => undefined);
    await fsp.rm(trash, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }

  await ctx.state.update((next) => {
    next.sandboxes = next.sandboxes.filter((item) => item.id !== record.id);
  });
  return { destroyed: record.id, portClosed: !(await portOpen(record.port)) };
}
