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
  if (route === "skill" && method === "POST") {
    const payload = await body();
    return manager.addSkill({ id: asId(payload), name: String(payload.name ?? "") });
  }
  if (route === "mcp" && method === "POST") {
    const payload = await body();
    return manager.addMcp({
      id: asId(payload),
      serverName: String(payload.serverName ?? ""),
      config: (typeof payload.config === "object" && payload.config ? payload.config : {}) as Record<string, unknown>,
    });
  }
  if (route === "preset" && method === "POST") {
    const payload = await body();
    return manager.usePreset({ id: asId(payload), preset: String(payload.preset ?? "") });
  }
  if (route === "clone" && method === "POST") {
    const payload = await body();
    return manager.clone({
      from: typeof payload.from === "string" ? payload.from : asId(payload),
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    });
  }
  if (route === "compare" && method === "POST") {
    const payload = await body();
    const a = typeof payload.a === "string" ? payload.a.trim() : "";
    const b = typeof payload.b === "string" ? payload.b.trim() : "";
    if (!a || !b) throw new SandboxError("compare 需要 a 与 b 两个实例 id", "missing-id");
    const text = String(payload.text ?? "").trim();
    if (!text) throw new SandboxError("compare 需要非空 text，空消息会白烧两次模型调用", "empty-prompt");
    return manager.compare({
      a,
      b,
      text,
      ...(typeof payload.sessionA === "string" ? { sessionA: payload.sessionA } : {}),
      ...(typeof payload.sessionB === "string" ? { sessionB: payload.sessionB } : {}),
      ...(typeof payload.timeoutMs === "number" ? { timeoutMs: payload.timeoutMs } : {}),
    });
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
