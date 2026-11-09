import { asMessage, SandboxError } from "../../shared/errors.ts";
import { readJsonBody, sendJson } from "../../shared/http.ts";
import { ROUTE_PREFIX, STYLESHEET_ROUTE, stripRoutePrefix } from "../../shared/routes.ts";
import type { HostContext, WebServerLike } from "./types.ts";
import { readStylesheet } from "./assets.ts";
import { createManager } from "./manager.ts";
import { dispatch } from "./routes.ts";
import { registerSandboxTools, type ToolsLike } from "./tools.ts";

/**
 * 当前会话的工作目录。install 靠它找插件源码：`process.cwd()` 是宿主进程的 cwd，
 * 与用户项目目录无关（实测会永远 package-not-found）。
 */
function workspaceResolver(ctx: HostContext): () => Promise<string | undefined> {
  return async () => {
    try {
      const agents = ctx.get("agents") as { currentInitiator?: () => unknown } | undefined;
      const workingDirectory = ctx.get("workingDirectory") as
        | { ensure?: (agent: unknown) => Promise<string>; defaultDirectory?: string }
        | undefined;
      const agent = agents?.currentInitiator?.();
      if (workingDirectory?.ensure && agent) return await workingDirectory.ensure(agent);
      return workingDirectory?.defaultDirectory;
    } catch {
      return undefined;
    }
  };
}

/**
 * 注册工具与 /__sbx 路由。
 *
 * 两个依赖都走 `ctx.inject`：`ctx.get` 在服务未就绪时返回 undefined，而插件 apply 的时机
 * 不确定，实测同一份代码会一次注册成功、一次什么都不注册——表现就是面板能开、但
 * `/__sbx/list` 404、样式表 404、整页裸 HTML。
 */
export function registerSandboxManager(ctx: HostContext): void {
  const manager = createManager(undefined, workspaceResolver(ctx));

  ctx.inject(["tools"], (scope) => {
    const tools = scope.tools as ToolsLike | undefined;
    if (tools) registerSandboxTools(tools, manager);
  });

  ctx.inject(["webServer"], (scope) => {
    const web = scope.webServer as WebServerLike | undefined;
    if (!web) return;

    const handler = async (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const route = stripRoutePrefix(url.pathname);
      try {
        // 面板样式作为外部样式表提供，浏览器可单独缓存与调试，不塞进 client 产物。
        if (route === STYLESHEET_ROUTE && (req.method ?? "GET") === "GET") {
          const css = await readStylesheet();
          res.writeHead(200, {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "no-cache",
            "content-length": Buffer.byteLength(css),
          });
          res.end(css);
          return;
        }
        const result = await dispatch(manager, req.method ?? "GET", route, url.searchParams, () => readJsonBody(req));
        sendJson(res, 200, { ok: true, ...(typeof result === "object" && result ? result : { value: result }) });
      } catch (error) {
        const status = error instanceof SandboxError && error.code === "unknown-route" ? 404 : 500;
        sendJson(res, status, { ok: false, error: asMessage(error) });
      }
    };

    const dispose = web.register({ kind: "prefix", path: ROUTE_PREFIX, handler });
    scope.effect?.(() => () => dispose());
  });
}
