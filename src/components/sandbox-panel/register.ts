import { PANEL_ID, PANEL_ORDER, SLOT_NAME, TEXTS } from "./config.ts";
import { SandboxPanel } from "./panel.ts";
import { ensureStylesheet } from "./stylesheet.ts";

export interface SlotsLike {
  inject(name: string, factory: () => unknown): void;
  register(options: Record<string, unknown>, component: unknown): unknown;
}

export interface PanelContext {
  slots: SlotsLike;
}

/** 把面板挂进设置页：注册即一节，导航标题跟随语言变化（label 是 thunk）。 */
export function registerPanel(ctx: PanelContext): void {
  ensureStylesheet();
  ctx.slots.inject(SLOT_NAME, () => ctx.slots.register(
    {
      name: SLOT_NAME,
      id: PANEL_ID,
      order: PANEL_ORDER,
      label: () => TEXTS.navLabel,
    },
    SandboxPanel,
  ));
}
