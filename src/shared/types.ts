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
  /** 已配置的 MCP server；每次重写 profile 补丁时按这份清单生成。 */
  mcp?: McpEntry[];
  /**
   * 从工作环境物化进来的 preset 内容（entry-list YAML 原文）。
   * 存原文而不是解析后的结构：`!!js` 表达式只能以文本形式进补丁。
   */
  preset?: { source: string; yaml: string };
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

/** 停止与启动共用同一个入参形状：只认实例。 */
export interface LifecycleInput {
  id: string;
}

/** 一个 MCP server 的配置；config 原样写进沙箱 profile 的 dsh-mcp-client 行。 */
export interface McpEntry {
  serverName: string;
  config: Record<string, unknown>;
}

export interface AddSkillInput {
  id: string;
  /** skill 目录名，来自工作目录下的 `skills/<name>` 或 `<name>/SKILL.md`。 */
  name: string;
}

export interface AddSkillResult {
  name: string;
  source: string;
  requiresRestart: boolean;
}

export interface AddMcpInput {
  id: string;
  serverName: string;
  config: Record<string, unknown>;
}

export interface AddMcpResult {
  servers: string[];
  requiresRestart: boolean;
}

export interface UsePresetInput {
  id: string;
  /** 工作环境里的 preset id。 */
  preset: string;
}

export interface UsePresetResult {
  preset: string;
  /** 物化进沙箱 run profile 的行数（按 YAML 非空行估）。 */
  rows: number;
  requiresRestart: boolean;
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

/** 停止：进程结束、端口释放，home 与对话都留着，之后可以再启动。 */
export interface StopResult {
  stopped: string;
  portClosed: boolean;
}

/** 启动：用已有目录与 profile 重新起进程，端口可能变化。 */
export interface StartResult {
  started: string;
  port: number;
  token: string;
  pid: number;
  ready: boolean;
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

/** 把工作区里的插件装进沙箱：junction + bundles 行，不改工作环境。 */
export interface InstallInput {
  id: string;
  package: string;
}

export interface InstallResult {
  package: string;
  source: string;
  bundles: string[];
  requiresReload: true;
}

/** 在沙箱里真实跑一轮对话，用来验证对话类插件。 */
export interface PromptInput {
  id: string;
  text: string;
  timeoutMs?: number;
  /** 续接已有会话：留空则新开一轮。多轮测试把上一轮返回的 session 传回来。 */
  session?: string;
}

export interface PromptResult {
  session: string;
  assistant: string;
  tools: string[];
  reason: "idle" | "timeout";
  events: number;
}

/** 一次看全：进程、会话、插件行、客户端图、日志里的错误。 */
export interface StatusResult {
  id: string;
  alive: boolean;
  listening: boolean;
  port: number;
  pid: number;
  bundles: string[];
  sessions: number;
  policy: string;
  clientEntries: string[];
  errors: string[];
}
