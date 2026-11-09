import type { StateStore } from "../../shared/state.ts";

/** 一个实例在磁盘上的位置。 */
export interface SandboxPaths {
  dir: string;
  home: string;
  workspace: string;
  profileDir: string;
  logFile: string;
  agentsHome: string;
}

/** 控制面的运行上下文：根目录与账本，由注册入口构造一次。 */
export interface ManagerContext {
  root: string;
  state: StateStore;
  /**
   * 当前会话的工作目录。插件源码从那里找，不能用 process.cwd()——宿主进程的 cwd
   * 与用户项目目录无关，实测会导致 install 永远 package-not-found。
   */
  workspaceDir?: () => Promise<string | undefined>;
}

/**
 * 宿主 ctx 的最小面：不引入 cordis 类型，保持运行时零依赖。
 *
 * `inject` 是必须的，不是可选的便利：`ctx.get` 在服务尚未就绪时返回 undefined，
 * 而插件的 apply 时机不确定——实测过同一份代码一次注册成功、一次静默什么都不注册。
 * `ctx.inject` 会等到依赖就绪再执行回调，且有依赖的服务不存在时只是永不执行。
 */
export interface HostContext {
  /** 只用于「服务不存在就什么都不做」的只读探测；依赖服务一律走 `inject`。 */
  get(name: string): unknown;
  inject(deps: string[], callback: (scope: HostScope) => void): unknown;
  effect?(register: () => () => void): void;
}

/** inject 回调里拿到的子作用域，服务直接挂在上面。 */
export interface HostScope extends HostContext {
  tools?: unknown;
  webServer?: unknown;
}

export interface WebServerLike {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void | Promise<void>;
  }): () => void;
}
