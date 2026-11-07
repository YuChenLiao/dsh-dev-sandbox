import { createElement as h, useCallback, useState, type ReactNode } from "react";
import { TAIL_LIMIT, TEXTS } from "./config.ts";
import { createSandbox, destroySandbox, fetchTail } from "./api.ts";
import { useSandboxes } from "./hooks.ts";
import { CreateForm } from "./parts/form.ts";
import { SandboxRow } from "./parts/row.ts";
import { PANEL_CSS } from "./styles.ts";
import type { EventCache } from "./types.ts";

/** 面板主体：只做组合与动作编排，数据获取在 hooks，展示在 parts。 */
export function SandboxPanel() {
  const { items, error, setError, reload } = useSandboxes();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cache, setCache] = useState<EventCache>({});

  const handleCreate = useCallback(async (input: { name?: string; bundles?: string[] }) => {
    setBusy(true);
    try {
      await createSandbox(input);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [reload, setError]);

  const handleDestroy = useCallback(async (id: string) => {
    if (!window.confirm(TEXTS.confirmDestroy)) return;
    setBusy(true);
    try {
      await destroySandbox(id);
      setExpanded((current) => (current === id ? null : current));
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [reload, setError]);

  const handleToggle = useCallback(async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    try {
      const data = await fetchTail(id, TAIL_LIMIT);
      setCache((current) => ({ ...current, [id]: data.events }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [expanded, setError]);

  const rows = (): ReactNode => {
    if (items === null) return h("div", { className: "sbx-empty" }, TEXTS.loading);
    if (items.length === 0) return h("div", { className: "sbx-empty" }, TEXTS.empty);
    return items.map((sandbox) => h(SandboxRow, {
      key: sandbox.id,
      sandbox,
      expanded: expanded === sandbox.id,
      events: cache[sandbox.id],
      busy,
      onToggle: () => void handleToggle(sandbox.id),
      onOpen: () => window.open(
        `http://127.0.0.1:${sandbox.port}/?token=${encodeURIComponent(sandbox.token)}`,
        "_blank",
        "noopener",
      ),
      onDestroy: () => void handleDestroy(sandbox.id),
    }));
  };

  return h("div", { className: "sbx-root" },
    h("style", null, PANEL_CSS),
    h("div", { className: "sbx-head" },
      h("div", { className: "sbx-grow" },
        h("div", { className: "sbx-title" }, TEXTS.title),
        h("div", { className: "sbx-sub" }, TEXTS.subtitle)),
      h("button", { className: "sbx-btn", type: "button", onClick: () => void reload(), disabled: busy },
        TEXTS.refresh)),
    error ? h("div", { className: "sbx-err" }, error) : null,
    h(CreateForm, { busy, onCreate: (input) => void handleCreate(input) }),
    rows(),
    h("div", { className: "sbx-note" }, TEXTS.footnote));
}
