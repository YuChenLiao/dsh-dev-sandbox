import type { SessionEventView } from "../../shared/types.ts";

/** 展开态持有的对话缓存，按实例 id 归档。 */
export type EventCache = Record<string, SessionEventView[]>;
