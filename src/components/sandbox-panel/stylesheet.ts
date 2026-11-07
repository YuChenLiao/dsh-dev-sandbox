import { stylesheetHref } from "../../shared/routes.ts";

/** 把面板样式作为外部样式表挂上；地址来自 shared/routes，与 host 的注册同源。 */

export const STYLESHEET_ID = "dsh-dev-sandbox-style";

/** 幂等：插件重挂时不重复插入。 */
export function ensureStylesheet(doc: Document = document): void {
  if (doc.getElementById(STYLESHEET_ID)) return;
  const link = doc.createElement("link");
  link.id = STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = stylesheetHref();
  doc.head.appendChild(link);
}
