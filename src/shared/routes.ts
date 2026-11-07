/** host 与 client 共用的路由常量；改前缀或路径只改这里，避免两侧失配。 */

export const ROUTE_PREFIX = "/__sbx";
export const STYLESHEET_ROUTE = "panel.css";

/** 前缀边界：后面必须跟斜杠或结束，避免 /__sbxfoo 被误剥成 foo。 */
const PREFIX_PATTERN = new RegExp(`^${ROUTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`);

/** 把业务路径拼成完整请求地址；path 带不带前导斜杠都行。 */
export function routeUrl(path: string): string {
  return `${ROUTE_PREFIX}/${path.replace(/^\/+/, "")}`;
}

/** 从请求路径里剥掉前缀；注册与解析共用同一份常量，改前缀不会让两边失配。 */
export function stripRoutePrefix(pathname: string): string {
  return pathname.replace(PREFIX_PATTERN, "");
}

export function stylesheetHref(): string {
  return routeUrl(STYLESHEET_ROUTE);
}
