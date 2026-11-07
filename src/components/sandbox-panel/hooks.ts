import { POLL_INTERVAL_MS } from "./config.ts";
import { fetchList } from "./api.ts";
import { useCallback, useEffect, useState } from "react";
import type { SandboxView } from "../../shared/types.ts";

export interface SandboxListState {
  items: SandboxView[] | null;
  error: string;
  setError: (message: string) => void;
  reload: () => Promise<void>;
}

/** 面板的数据源：首次拉取 + 定时刷新，错误只记录不清空已有列表。 */
export function useSandboxes(): SandboxListState {
  const [items, setItems] = useState<SandboxView[] | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const data = await fetchList();
      setItems(data.sandboxes);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return { items, error, setError, reload };
}
