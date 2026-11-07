/** 跨组件共享的常量。组件自己的常量放各自的 config.ts。 */

/** 没有任何额外 bundle 时，沙箱 profile 加载的最小组合。 */
export const DEFAULT_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] as const;

/** 沙箱实例使用的 profile 名，与工作环境的 profile 无关。 */
export const SANDBOX_PROFILE = "sbx";

/** 实例账本文件名，位于沙箱根目录。 */
export const STATE_FILE = "state.json";
export const TRASH_PREFIX = ".trash-";

/** 从宿主环境复制给子进程的变量白名单；其余一律丢弃，DSH_* 全部重设。 */
export const KEEP_ENV: ReadonlySet<string> = new Set([
  "PATH", "SystemRoot", "windir", "TEMP", "TMP", "USERPROFILE", "APPDATA",
  "LOCALAPPDATA", "COMSPEC", "PATHEXT", "NUMBER_OF_PROCESSORS", "OS",
  "PROCESSOR_ARCHITECTURE", "PROGRAMDATA", "PROGRAMFILES", "HOMEDRIVE", "HOMEPATH", "LANG",
]);

/** 超时。 */
export const BOOT_TIMEOUT_MS = 90_000;
export const READY_TIMEOUT_MS = 30_000;
export const PORT_RELEASE_TIMEOUT_MS = 12_500;
export const COMMAND_TIMEOUT_MS = 60_000;
export const PROBE_TIMEOUT_MS = 800;

/** HTTP 请求体上限。 */
export const MAX_BODY_BYTES = 1 << 20;

/** 启动日志里宿主报告的地址；端口由系统分配，解析它而不是预设端口。 */
export const LISTEN_URL_PATTERN = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([\w-]+)/;

/** 启动失败的早期特征，命中就不必等满超时。 */
export const BOOT_FAILURE_PATTERN = /failed to load|cannot resolve profile bundle|ERR_UNSUPPORTED/;

/** 合法的 npm 包名：工具层与 profile 写入共用一个判据，避免包名被当成路径。 */
export const PACKAGE_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
