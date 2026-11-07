import { createElement as h, useCallback, useRef, useState, type ReactNode } from "react";
import type { SandboxView } from "../../shared/types.ts";
import { TAIL_LIMIT, TEXTS } from "./config.ts";
import { createSandbox, destroySandbox, fetchTail, startSandbox, stopSandbox } from "./api.ts";
import { useSandboxes } from "./hooks.ts";
import { CreateForm } from "./parts/form.ts";
import { SandboxDetail } from "./parts/detail.ts";
import { SandboxRow } from "./parts/row.ts";
import type { EventCache } from "./types.ts";

const openSandbox = (sandbox: SandboxView): void => {
  window.open(
    `http://127.0.0.1:${sandbox.port}/?token=${encodeURIComponent(sandbox.token)}`,
    "_blank",
    "noopener",
  );
};

const asMessage = (caught: unknown): string => (caught instanceof Error ? caught.message : String(caught));

export interface SandboxPanelProps {
  /** better-sidebar 会传 tab；在 tab 里时面板不再重复渲染标题（tab 头已经有）。 */
  tab?: unknown;
}

/** 面板主体：只做组合与动作编排，数据获取在 hooks，展示在 parts。 */
export function SandboxPanel(props: SandboxPanelProps = {}) {
  const inTab = Boolean(props.tab);
  const { items, error, setError, reload } = useSandboxes();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cache, setCache] = useState<EventCache>({});

  // busy 只控制按钮外观，挡不住并发点击；这个 ref 才是互斥量。
  const inFlight = useRef(false);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (caught) {
      setError(asMessage(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [reload, setError]);

  const handleCreate = useCallback((input: { name?: string; bundles?: string[] }) =>
    void run(() => createSandbox(input)), [run]);

  const handleStop = useCallback((id: string) => {
    if (!window.confirm(TEXTS.confirmStop)) return;
    void run(() => stopSandbox(id));
  }, [run]);

  const handleStart = useCallback((id: string) => void run(() => startSandbox(id)), [run]);

  const handleDestroy = useCallback((id: string) => {
    if (!window.confirm(TEXTS.confirmDestroy)) return;
    setExpanded((current) => (current === id ? null : current));
    setSelected((current) => (current === id ? null : current));
    void run(() => destroySandbox(id));
  }, [run]);

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
      setError(asMessage(caught));
    }
  }, [expanded, setError]);

  // 详情视图：单个实例的运行期事实，返回后回到列表。
  const picked = selected && items ? items.find((item) => item.id === selected) : undefined;
  if (picked) {
    return h(SandboxDetail, {
      sandbox: picked,
      busy,
      onBack: () => setSelected(null),
      onOpen: () => openSandbox(picked),
      onStop: () => handleStop(picked.id),
      onStart: () => handleStart(picked.id),
      onDestroy: () => handleDestroy(picked.id),
    });
  }

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
      onOpen: () => openSandbox(sandbox),
      onDetail: () => setSelected(sandbox.id),
      onStop: () => handleStop(sandbox.id),
      onStart: () => handleStart(sandbox.id),
      onDestroy: () => handleDestroy(sandbox.id),
    }));
  };

  return h("div", { className: "sbx-root" },
    h("div", { className: "sbx-head" },
      h("div", { className: "sbx-grow" },
        inTab ? null : h("div", { className: "sbx-title" }, TEXTS.title),
        h("div", { className: "sbx-sub" }, TEXTS.subtitle)),
      h("button", { className: "sbx-btn", type: "button", onClick: () => void reload(), disabled: busy },
        TEXTS.refresh)),
    error ? h("div", { className: "sbx-err" }, error) : null,
    h(CreateForm, { busy, onCreate: (input) => handleCreate(input) }),
    rows(),
    h("div", { className: "sbx-note" }, TEXTS.footnote));
}
