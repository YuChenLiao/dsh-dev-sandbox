import { asMessage, SandboxError } from "../../shared/errors.ts";
import { readJsonBody, sendJson } from "../../shared/http.ts";
import type { HostContext, WebServerLike } from "./types.ts";
import { createManager } from "./manager.ts";
import { dispatch } from "./routes.ts";

export const ROUTE_PREFIX = "/__sbx";

/** 把控制面挂成宿主的一条 prefix 路由；没有 webServer（例如纯 headless）时安静退出。 */
export function registerSandboxManager(ctx: HostContext): void {
  const web = ctx.get("webServer") as WebServerLike | undefined;
  if (!web) return;
  const manager = createManager();

  const handler = async (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = url.pathname.replace(/^\/__sbx\/?/, "");
    try {
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
