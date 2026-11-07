import { createElement as h } from "react";
import type { SessionEventView } from "../../../shared/types.ts";
import { TEXTS } from "../config.ts";

export interface EventListProps {
  events: SessionEventView[] | undefined;
}

/** 展开区：沙箱对话的只读视图，来自它自己的会话落盘文件。 */
export function EventList({ events }: EventListProps) {
  if (!events || events.length === 0) {
    return h("div", { className: "sbx-mono" }, TEXTS.noSessions);
  }
  return h("div", null, events.map((event, index) => h("div", { key: index, className: "sbx-ev" },
    h("span", { className: "sbx-ev-type" }, event.type),
    h("span", { className: "sbx-ev-text" }, event.text))));
}
