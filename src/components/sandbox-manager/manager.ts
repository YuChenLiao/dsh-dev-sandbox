import { resolveRoot } from "../../shared/paths.ts";
import { STATE_FILE } from "../../shared/config.ts";
import { StateStore } from "../../shared/state.ts";
import type {
  AddMcpInput,
  AddMcpResult,
  AddSkillInput,
  AddSkillResult,
  CloneInput,
  CloneResult,
  CompareInput,
  CompareResult,
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
  ReadInput,
  ReadResult,
  ReconfigureInput,
  ReconfigureResult,
  SandboxRecord,
  SandboxView,
  StartResult,
  StatusResult,
  StopResult,
  TailInput,
  TailResult,
  UsePresetInput,
  UsePresetResult,
} from "../../shared/types.ts";
import { readLog, listSandboxes, readTail } from "./inspect.ts";
import { addMcp, addSkill, readBootLog, readWorkspace, usePreset } from "./extras.ts";
import { installPackage } from "./install.ts";
import { createSandbox, cloneSandbox, destroySandbox, restartSandbox, startSandbox, stopSandbox } from "./lifecycle.ts";
import { compareSandboxes } from "./compare.ts";
import { promptSandbox } from "./prompt.ts";
import { readStatus } from "./status.ts";
import { reconfigureSandbox } from "./reconfigure.ts";
import type { ManagerContext } from "./types.ts";
import path from "node:path";

export interface SandboxManager {
  readonly root: string;
  create(input: CreateSandboxInput): Promise<SandboxRecord>;
  clone(input: CloneInput): Promise<CloneResult>;
  compare(input: CompareInput): Promise<CompareResult>;
  list(): Promise<SandboxView[]>;
  install(input: InstallInput): Promise<InstallResult>;
  addSkill(input: AddSkillInput): Promise<AddSkillResult>;
  addMcp(input: AddMcpInput): Promise<AddMcpResult>;
  usePreset(input: UsePresetInput): Promise<UsePresetResult>;
  read(input: ReadInput): Promise<ReadResult>;
  bootLog(input: LogInput): Promise<LogResult>;
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
  resolvePreset?: (id: string) => Promise<string | undefined>,
): SandboxManager {
  const ctx: ManagerContext = {
    root,
    state: new StateStore(path.join(root, STATE_FILE)),
    workspaceDir,
    resolvePreset,
  };
  return {
    root,
    create: (input) => createSandbox(ctx, input),
    clone: (input) => cloneSandbox(ctx, input),
    compare: (input) => compareSandboxes(ctx, input),
    list: () => listSandboxes(ctx),
    install: (input) => installPackage(ctx, input),
    addSkill: (input) => addSkill(ctx, input),
    addMcp: (input) => addMcp(ctx, input),
    usePreset: (input) => usePreset(ctx, input),
    read: (input) => readWorkspace(ctx, input),
    bootLog: (input) => readBootLog(ctx, input),
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
