import fsp from "node:fs/promises";
import path from "node:path";
import { PORT_RELEASE_TIMEOUT_MS, SANDBOX_PROFILE, TRASH_PREFIX } from "../../shared/config.ts";
import { insidePath } from "../../shared/paths.ts";
import { killTree, portOpen, sandboxEnv, sleep } from "../../shared/process.ts";import type { CreateSandboxInput, DestroyInput, DestroyResult, SandboxRecord } from "../../shared/types.ts";
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
import { ensureModuleResolution, resolveBundles, writeEnvFile, writeProfile } from "./profile.ts";
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
    await ensureModuleResolution(paths);

    const booted = await boot(paths, env);
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
    // boot 已结束自己的进程树，这里只收目录
    await sleep(600);
    await fsp.rm(paths.dir, { recursive: true, force: true, maxRetries: 4 }).catch(() => undefined);
    throw error;
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
