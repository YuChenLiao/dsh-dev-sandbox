import { PANEL_ID, PANEL_ORDER, SLOT_NAME, TEXTS } from "./config.ts";
import { SandboxPanel } from "./panel.ts";
import { ensureStylesheet } from "./stylesheet.ts";

export interface SlotsLike {
  inject(name: string, factory: () => unknown): void;
  register(options: Record<string, unknown>, component: unknown): unknown;
}

/** dsh-better-sidebar 的侧栏注册面；只依赖这一个方法，不引入它的包。 */
export interface SidebarLike {
  registerTab(tab: { id: string; title: string; component: unknown }): unknown;
}

export interface PanelContext {
  slots: SlotsLike;
  get?(name: string): unknown;
}

/**
 * 装了 better-sidebar 就进侧栏，否则退回设置页——同一份组件，两个入口。
 *
 * 用 `ctx.get` 而不是 `inject: ["betterSidebar"]`：后者在没装该插件时会让整个 client 插件不 apply，
 * 连设置页都进不去。代价是没有顺序保证——若它的服务在本插件 apply 之后才注册，这里拿不到就会
 * 永久落到设置分支。当前 profile 里 better-sidebar 排在前面，但那是环境巧合。
 */
export function registerPanel(ctx: PanelContext): void {
  ensureStylesheet();

  let sidebar: SidebarLike | undefined;
  try {
    sidebar = ctx.get?.("betterSidebar") as SidebarLike | undefined;
  } catch {
    sidebar = undefined;
  }
  if (sidebar && typeof sidebar.registerTab === "function") {
    sidebar.registerTab({ id: PANEL_ID, title: TEXTS.navLabel, component: SandboxPanel });
    return;
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
