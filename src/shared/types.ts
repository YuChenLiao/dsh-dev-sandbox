/** 跨组件共享的数据形状。 */

/** 一条沙箱实例的完整账本记录，持久化在 state.json。 */
export interface SandboxRecord {
  id: string;
  name: string;
  home: string;
  workspace: string;
  logFile: string;
  profile: string;
  bundles: string[];
  port: number;
  token: string;
  pid: number;
  createdAt: number;
  ready: boolean;
}

/** 面板与工具看到的实例摘要，只含可展示字段。 */
export interface SandboxView {
  id: string;
  name: string;
  port: number;
  /** 只给同源面板的「打开」用；不进入任何持久化账本。 */
  token: string;
  pid: number;
  alive: boolean;
  listening: boolean;
  sessions: number;
  bundles: string[];
  createdAt: number;
}

/** 账本文件结构。 */
export interface SandboxState {
  sandboxes: SandboxRecord[];
}

export interface CreateSandboxInput {
  name?: string;
  bundles?: string[];
  apiKey?: string;
}

export interface ReconfigureInput {
  id: string;
  bundles?: string[];
  restart?: boolean;
}

export interface DestroyInput {
  id: string;
}

export interface TailInput {
  id: string;
  limit?: number;
}

export interface LogInput {
  id: string;
  lines?: number;
}

/** 会话日志里一条事件的展示形态。 */
export interface SessionEventView {
  type: string;
  seq?: number;
  at?: number | null;
  text: string;
}

export interface TailResult {
  sessions: number;
  session?: string;
  total?: number;
  events: SessionEventView[];
}

export interface LogResult {
  text: string;
}

export interface DestroyResult {
  destroyed: string;
  portClosed: boolean;
}

export interface ReconfigureResult {
  ok: boolean;
  stage?: string;
  detail?: string;
  bundles?: string[];
  requiresRestart?: boolean;
  restarted?: string;
  port?: number;
}
