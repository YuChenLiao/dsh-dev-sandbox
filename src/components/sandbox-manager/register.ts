import { asMessage, SandboxError } from "../../shared/errors.ts";
import { readJsonBody, sendJson } from "../../shared/http.ts";
import { ROUTE_PREFIX, STYLESHEET_ROUTE, stripRoutePrefix } from "../../shared/routes.ts";
import type { HostContext, WebServerLike } from "./types.ts";
import { readStylesheet } from "./assets.ts";
import { createManager } from "./manager.ts";
import { dispatch } from "./routes.ts";
import { registerSandboxTools } from "./tools.ts";

/** 注册工具与 /__sbx 路由；没有 webServer（例如纯 headless）时只留工具。 */
export function registerSandboxManager(ctx: HostContext): void {
  const manager = createManager();
  registerSandboxTools(ctx, manager);

  const web = ctx.get("webServer") as WebServerLike | undefined;
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
  ctx.effect?.(() => () => dispose());
}
