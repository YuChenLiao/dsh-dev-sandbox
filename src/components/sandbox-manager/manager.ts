import { resolveRoot } from "../../shared/paths.ts";
import { STATE_FILE } from "../../shared/config.ts";
import { StateStore } from "../../shared/state.ts";
import type {
  CreateSandboxInput,
  DestroyInput,
  DestroyResult,
  LogInput,
  LogResult,
  ReconfigureInput,
  ReconfigureResult,
  SandboxRecord,
  SandboxView,
  TailInput,
  TailResult,
} from "../../shared/types.ts";
import { readLog, listSandboxes, readTail } from "./inspect.ts";
import { createSandbox, destroySandbox } from "./lifecycle.ts";
import { reconfigureSandbox } from "./reconfigure.ts";
import type { ManagerContext } from "./types.ts";
import path from "node:path";

export interface SandboxManager {
  readonly root: string;
  create(input: CreateSandboxInput): Promise<SandboxRecord>;
  list(): Promise<SandboxView[]>;
  destroy(input: DestroyInput): Promise<DestroyResult>;
  reconfigure(input: ReconfigureInput): Promise<ReconfigureResult>;
  tail(input: TailInput): Promise<TailResult>;
  log(input: LogInput): Promise<LogResult>;
}

/** 组装控制面：根目录 + 账本，方法分别落在 lifecycle / inspect / reconfigure。 */
export function createManager(root = resolveRoot()): SandboxManager {
  const ctx: ManagerContext = { root, state: new StateStore(path.join(root, STATE_FILE)) };
  return {
    root,
    create: (input) => createSandbox(ctx, input),
    list: () => listSandboxes(ctx),
    destroy: (input) => destroySandbox(ctx, input),
    reconfigure: (input) => reconfigureSandbox(ctx, input),
    tail: (input) => readTail(ctx, input),
    log: (input) => readLog(ctx, input),
  };
}
