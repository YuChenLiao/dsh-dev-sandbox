import { registerSandboxManager } from "../components/sandbox-manager/register.ts";
import type { HostContext } from "../components/sandbox-manager/types.ts";

/** Host 入口：只负责把可注册组件接上，逻辑全在组件目录里。 */
export function apply(ctx: HostContext): void {
  registerSandboxManager(ctx);
}
