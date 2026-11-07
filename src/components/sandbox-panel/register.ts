import { PANEL_ID, PANEL_ORDER, SLOT_NAME, TEXTS } from "./config.ts";
import { SandboxPanel } from "./panel.ts";
import { ensureStylesheet } from "./stylesheet.ts";

export interface SlotsLike {
  inject(name: string, factory: () => unknown): void;
  register(options: Record<string, unknown>, component: unknown): unknown;
}

/** dsh-better-sidebar 的侧栏注册面；只依赖这一个方法，不引入它的包。 */
export interface SidebarLike {
  registerTab(tab: {
    id: string;
    title: string;
    description?: string;
    component: unknown;
  }): unknown;
}

export interface PanelContext {
  slots: SlotsLike;
  inject(deps: string[], callback: (scope: { betterSidebar?: SidebarLike }) => void): unknown;
}

/**
 * 两个入口，同一份组件。
 *
 * 侧栏用 `ctx.inject(["betterSidebar"], …)` 挂：它是 cordis 的子 fiber，服务就绪后才执行，
 * 而且服务不存在时只是永不执行——不会像 `inject: ["betterSidebar"]` 那样让整个插件不 apply。
 * 原来用 `ctx.get` 同步取，依赖 apply 顺序，better-sidebar 后注册就拿不到且不重试。
 *
 * 设置页那一节无条件注册作为兜底：侧栏没装、没开、或者 tab 被关掉时仍然进得去。
 */
export function registerPanel(ctx: PanelContext): void {
  ensureStylesheet();

  if (typeof ctx.inject === "function") {
    ctx.inject(["betterSidebar"], (scope) => {
      const sidebar = scope.betterSidebar;
      if (!sidebar || typeof sidebar.registerTab !== "function") return;
      sidebar.registerTab({
        id: PANEL_ID,
        title: TEXTS.navLabel,
        description: TEXTS.subtitle,
        component: SandboxPanel,
      });
    });
  }

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
