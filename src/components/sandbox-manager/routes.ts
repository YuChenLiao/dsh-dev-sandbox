import { SandboxError } from "../../shared/errors.ts";
import type { CreateSandboxInput, ReconfigureInput } from "../../shared/types.ts";
import type { SandboxManager } from "./manager.ts";

export type BodyReader = () => Promise<Record<string, unknown>>;

function asId(body: Record<string, unknown>): string {
  const id = body.id;
  if (typeof id !== "string" || !id.trim()) throw new SandboxError("缺少 id", "missing-id");
  return id.trim();
}

function asBundles(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new SandboxError("bundles 必须是数组", "bad-bundles");
  return value.map((item) => String(item)).map((item) => item.trim()).filter(Boolean);
}

/**
 * 路由表：只做参数校验与调用，HTTP 语义留在 register.ts。
 * 这样同一套动作既能被面板调用，也能被将来的工具直接复用。
 */
export async function dispatch(
  manager: SandboxManager,
  method: string,
  route: string,
  query: URLSearchParams,
  body: BodyReader,
): Promise<unknown> {
  if (route === "list" && method === "GET") {
    return { root: manager.root, sandboxes: await manager.list() };
  }
  if (route === "tail" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("缺少 id", "missing-id");
    return manager.tail({ id, limit: Number(query.get("limit") ?? 24) });
  }
  if (route === "status" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("缺少 id", "missing-id");
    return manager.status(id);
  }
  if (route === "log" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("缺少 id", "missing-id");
    return manager.log({ id, lines: Number(query.get("lines") ?? 40) });
  }
  if (route === "create" && method === "POST") {
    const payload = await body();
    return { sandbox: await manager.create({
      name: typeof payload.name === "string" ? payload.name : undefined,
      bundles: asBundles(payload.bundles),
      apiKey: typeof payload.apiKey === "string" ? payload.apiKey : undefined,
    } satisfies CreateSandboxInput) };
  }
  if (route === "stop" && method === "POST") {
    return manager.stop({ id: asId(await body()) });
  }
  if (route === "start" && method === "POST") {
    return manager.start({ id: asId(await body()) });
  }
  if (route === "restart" && method === "POST") {
    return manager.restart({ id: asId(await body()) });
  }
  if (route === "destroy" && method === "POST") {
    return manager.destroy({ id: asId(await body()) });
  }
  if (route === "config" && method === "POST") {
    const payload = await body();
    return manager.reconfigure({
      id: asId(payload),
      bundles: asBundles(payload.bundles),
      restart: payload.restart === true,
    } satisfies ReconfigureInput);
  }
  throw new SandboxError(`未知路由：${route || "/"}`, "unknown-route");
}
