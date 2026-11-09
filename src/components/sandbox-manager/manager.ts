import { resolveRoot } from "../../shared/paths.ts";
import { STATE_FILE } from "../../shared/config.ts";
import { StateStore } from "../../shared/state.ts";
import type {
  CreateSandboxInput,
  DestroyInput,
  DestroyResult,
  InstallInput,
  InstallResult,
  LifecycleInput,
  LogInput,
  LogResult,
  PromptInput,
  PromptResult,
  ReconfigureInput,
  ReconfigureResult,
  SandboxRecord,
  SandboxView,
  StartResult,
  StatusResult,
  StopResult,
  TailInput,
  TailResult,
} from "../../shared/types.ts";
import { readLog, listSandboxes, readTail } from "./inspect.ts";
import { installPackage } from "./install.ts";
import { createSandbox, destroySandbox, restartSandbox, startSandbox, stopSandbox } from "./lifecycle.ts";
import { promptSandbox } from "./prompt.ts";
import { readStatus } from "./status.ts";
import { reconfigureSandbox } from "./reconfigure.ts";
import type { ManagerContext } from "./types.ts";
import path from "node:path";

export interface SandboxManager {
  readonly root: string;
  create(input: CreateSandboxInput): Promise<SandboxRecord>;
  list(): Promise<SandboxView[]>;
  install(input: InstallInput): Promise<InstallResult>;
  prompt(input: PromptInput): Promise<PromptResult>;
  status(id: string): Promise<StatusResult>;
  stop(input: LifecycleInput): Promise<StopResult>;
  start(input: LifecycleInput): Promise<StartResult>;
  restart(input: LifecycleInput): Promise<StartResult>;
  destroy(input: DestroyInput): Promise<DestroyResult>;
  reconfigure(input: ReconfigureInput): Promise<ReconfigureResult>;
  tail(input: TailInput): Promise<TailResult>;
  log(input: LogInput): Promise<LogResult>;
}

/** 组装控制面：根目录 + 账本，方法分别落在 lifecycle / install / prompt / status / inspect / reconfigure。 */
export function createManager(
  root = resolveRoot(),
  workspaceDir?: () => Promise<string | undefined>,
): SandboxManager {
  const ctx: ManagerContext = { root, state: new StateStore(path.join(root, STATE_FILE)), workspaceDir };
  return {
    root,
    create: (input) => createSandbox(ctx, input),
    list: () => listSandboxes(ctx),
    install: (input) => installPackage(ctx, input),
    prompt: (input) => promptSandbox(ctx, input),
    status: (id) => readStatus(ctx, id),
    stop: (input) => stopSandbox(ctx, input),
    start: (input) => startSandbox(ctx, input),
    restart: (input) => restartSandbox(ctx, input),
    destroy: (input) => destroySandbox(ctx, input),
    reconfigure: (input) => reconfigureSandbox(ctx, input),
    tail: (input) => readTail(ctx, input),
    log: (input) => readLog(ctx, input),
  };
}
