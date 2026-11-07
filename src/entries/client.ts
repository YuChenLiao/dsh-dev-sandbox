import { registerPanel, type PanelContext } from "../components/sandbox-panel/register.ts";

/**
 * Client 入口：构建后被包进 window.__ModuleLoader__.load 的 factory 里，
 * react 由 ModuleLoader 注入的 require 提供。
 */
export const plugin = {
  inject: ["slots"],
  apply(ctx: PanelContext): void {
    registerPanel(ctx);
  },
};
