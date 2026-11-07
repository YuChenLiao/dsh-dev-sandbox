import { createElement as h } from "react";
import type { SandboxView, SessionEventView } from "../../../shared/types.ts";
import { TEXTS } from "../config.ts";
import { EventList } from "./events.ts";

export interface SandboxRowProps {
  sandbox: SandboxView;
  expanded: boolean;
  events: SessionEventView[] | undefined;
  busy: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDetail: () => void;
  onStop: () => void;
  onStart: () => void;
  onDestroy: () => void;
}

const ago = (at: number): string => {
  if (!at) return "";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`;
  return `${Math.round(seconds / 86400)} 天前`;
};

/** 一行实例：状态点、身份、动作组、可展开的对话。 */
export function SandboxRow(props: SandboxRowProps) {
  const { sandbox, expanded, events, busy } = props;
  const live = sandbox.alive && sandbox.listening;

  return h("div", { className: "sbx-row" },
    h("div", { className: "sbx-row-main" },
      h("span", { className: "sbx-dot" + (live ? " sbx-dot-live" : ""), "aria-hidden": true }),
      h("span", { className: "sbx-name" }, sandbox.name),
      h("span", { className: "sbx-mono" }, sandbox.id),
      h("div", { className: "sbx-meta" },
        h("span", null, `:${sandbox.port}`),
        h("span", null, `${sandbox.sessions}${TEXTS.sessionsUnit}`),
        h("span", null, `${sandbox.bundles.length}${TEXTS.bundlesUnit}`),
        h("span", null, ago(sandbox.createdAt))),
      h("div", { className: "sbx-actions" },
        h("button", { className: "sbx-btn", type: "button", onClick: props.onToggle },
          expanded ? TEXTS.collapse : TEXTS.tail),
        h("button", { className: "sbx-btn", type: "button", disabled: !live, onClick: props.onOpen }, TEXTS.open),
        live
          ? h("button", { className: "sbx-btn", type: "button", disabled: busy, onClick: props.onStop }, TEXTS.stop)
          : h("button", { className: "sbx-btn sbx-btn-primary", type: "button", disabled: busy, onClick: props.onStart }, TEXTS.start),
        h("button", { className: "sbx-btn", type: "button", onClick: props.onDetail }, TEXTS.detail),
        h("button", { className: "sbx-btn sbx-btn-danger", type: "button", disabled: busy, onClick: props.onDestroy },
          TEXTS.destroy))),
    expanded ? h("div", { className: "sbx-body" }, h(EventList, { events })) : null);
}
