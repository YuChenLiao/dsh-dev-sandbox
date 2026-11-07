import { createElement as h, useCallback, useEffect, useState } from "react";
import type { SandboxView, SessionEventView, StatusResult } from "../../../shared/types.ts";
import { fetchStatus, fetchTail } from "../api.ts";
import { TAIL_LIMIT, TEXTS } from "../config.ts";
import { EventList } from "./events.ts";

export interface SandboxDetailProps {
  sandbox: SandboxView;
  busy: boolean;
  onBack: () => void;
  onOpen: () => void;
  onDestroy: () => void;
}

const row = (label: string, value: string) =>
  h("div", { className: "sbx-kv", key: label },
    h("span", { className: "sbx-kv-key" }, label),
    h("span", { className: "sbx-kv-val" }, value));

/** 单个沙箱的详情：运行期事实全在这里，不靠列表那一行的概要。 */
export function SandboxDetail(props: SandboxDetailProps) {
  const { sandbox } = props;
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [events, setEvents] = useState<SessionEventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [next, tail] = await Promise.all([
        fetchStatus(sandbox.id),
        fetchTail(sandbox.id, TAIL_LIMIT),
      ]);
      setStatus(next);
      setEvents(tail.events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [sandbox.id]);

  useEffect(() => { void load(); }, [load]);

  const live = Boolean(status?.alive && status.listening);

  const body = () => {
    if (error) return h("div", { className: "sbx-err" }, error);
    if (!status) return h("div", { className: "sbx-empty" }, TEXTS.loading);
    return h("div", { className: "sbx-detail-body" },
      h("div", { className: "sbx-kvs" },
        row(TEXTS.kvLive, live ? TEXTS.live : TEXTS.dead),
        row(TEXTS.kvPort, `:${status.port}`),
        row(TEXTS.kvPid, String(status.pid)),
        row(TEXTS.kvPolicy, status.policy),
        row(TEXTS.kvSessions, String(status.sessions)),
        row(TEXTS.kvBundles, status.bundles.join(" · ") || "—")),
      h("div", { className: "sbx-sub-title" }, TEXTS.clientGraph),
      status.clientEntries.length > 0
        ? h("div", { className: "sbx-chips" }, ...status.clientEntries.map((entry) =>
          h("span", { className: "sbx-chip", key: entry }, entry)))
        : h("div", { className: "sbx-empty" }, TEXTS.noClientGraph),
      status.errors.length > 0
        ? h("div", { className: "sbx-err" }, ...status.errors.map((line) => h("div", { key: line }, line)))
        : null,
      h("div", { className: "sbx-sub-title" }, TEXTS.recentEvents),
      h(EventList, { events: events ?? undefined }));
  };

  return h("div", { className: "sbx-root sbx-detail" },
    h("div", { className: "sbx-head" },
      h("button", { className: "sbx-btn", type: "button", onClick: props.onBack }, TEXTS.back),
      h("div", { className: "sbx-grow" },
        h("div", { className: "sbx-title" }, sandbox.name),
        h("div", { className: "sbx-sub" }, sandbox.id)),
      h("button", { className: "sbx-btn", type: "button", disabled: !live, onClick: props.onOpen }, TEXTS.open),
      h("button", { className: "sbx-btn", type: "button", disabled: props.busy, onClick: () => void load() },
        TEXTS.refresh),
      h("button", { className: "sbx-btn sbx-btn-danger", type: "button", disabled: props.busy, onClick: props.onDestroy },
        TEXTS.destroy)),
    body());
}
