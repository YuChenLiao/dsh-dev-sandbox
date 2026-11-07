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
}

/** 宿主 ctx 的最小面：不引入 cordis 类型，保持运行时零依赖。 */
export interface HostContext {
  get(name: string): unknown;
  effect?(register: () => () => void): void;
}

export interface WebServerLike {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void | Promise<void>;
  }): () => void;
}
