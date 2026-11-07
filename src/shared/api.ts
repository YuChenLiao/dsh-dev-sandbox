/** 面板到宿主的最小 HTTP 客户端，地址由 shared/routes 统一拼装。 */
import { routeUrl } from "./routes.ts";

interface Envelope {
  ok?: boolean;
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(routeUrl(path), {
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const payload = (await response.json().catch(() => ({ ok: false, error: "响应不是 JSON" }))) as Envelope & T;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? `请求失败（${response.status}）`);
  }
  return payload;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}
