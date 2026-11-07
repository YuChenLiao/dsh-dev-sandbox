import { apiGet, apiPost } from "../../shared/api.ts";
import type {
  DestroyResult,
  SandboxRecord,
  SandboxView,
  SessionEventView,
  StatusResult,
  TailResult,
} from "../../shared/types.ts";

export interface ListResult {
  root: string;
  sandboxes: SandboxView[];
}

export const fetchList = (): Promise<ListResult> => apiGet<ListResult>("list");

export const createSandbox = (input: { name?: string; bundles?: string[] }): Promise<{ sandbox: SandboxRecord }> =>
  apiPost<{ sandbox: SandboxRecord }>("create", input);

export const destroySandbox = (id: string): Promise<DestroyResult> =>
  apiPost<DestroyResult>("destroy", { id });

export const fetchTail = (id: string, limit: number): Promise<TailResult> =>
  apiGet<TailResult>(`tail?id=${encodeURIComponent(id)}&limit=${limit}`);

export const fetchStatus = (id: string): Promise<StatusResult> =>
  apiGet<StatusResult>(`status?id=${encodeURIComponent(id)}`);

export const fetchLog = (id: string, lines: number): Promise<{ text: string }> =>
  apiGet<{ text: string }>(`log?id=${encodeURIComponent(id)}&lines=${lines}`);

export type { SessionEventView };
