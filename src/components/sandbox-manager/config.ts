/** sandbox-manager 组件自己的常量；跨组件共享的常量在 shared/config.ts。 */

export const INSTANCE_ID_PREFIX = "sbx-";
export const INSTANCE_ID_LENGTH = 6;

export const HOME_DIR = "home";
export const WORKSPACE_DIR = "workspace";
export const PROFILE_DIR = "profiles";
export const PROFILE_AGENTS_DIR = "agents";
export const PROFILE_NODE_MODULES = "node_modules";
export const LOG_FILE = "boot.log";
export const ENV_FILE = ".env";

export const PROFILE_PACKAGE_NAME = "dsh-profile-sbx";
export const PROFILE_PATCH_HEADER = "# 沙箱 profile 层：本实例的约束与插件行";
export const API_KEY_ENV = "DEEPSEEK_API_KEY";

/**
 * 沙箱 profile 的补丁：把 agent 的文件与 shell 钉在 workspace 里。
 * 不依赖 base 的默认值，避免哪天默认放宽后沙箱跟着放宽。
 */
export function profilePatchBody(workspaceRoot: string): string {
  return [
    PROFILE_PATCH_HEADER,
    "- id: sandbox-policy",
    "  config:",
    "    mode: workspace-write",
    `    workspaceRoot: ${JSON.stringify(workspaceRoot)}`,
    // base 的 permission 行依赖 DSH_PERMISSION_MODE 推出组合默认；
    // 沙箱把这个变量清掉了，组合默认匹配不到任何 preset，必须显式给 defaultPreset。
    "- id: permission",
    "  config:",
    "    defaultPreset: workspace-write",
    "    presets:",
    "      read-only:",
    "        sandbox: read-only",
    "        approval: ask",
    "      workspace-write:",
    "        sandbox: workspace-write",
    "        approval: ask",
    "      danger-full-access:",
    "        sandbox: danger-full-access",
    "        approval: never",
    "",
  ].join("\n");
}

/** 凭据继承：复制工作环境的凭据文件，但剥掉这条 GUI 会话记录。 */
export const CREDENTIALS_FILE = ".credentials.yaml";
export const BROWSER_SESSION_RECORD = "client-connection/browser-session";
export const PLATFORM_ACCOUNT_PREFIX = "deepseek-account-platform/";

/** 跑对话用的 headless profile：不带 web-app，只装 base + headless + 待测插件。 */
export const RUN_PROFILE = "run";
export const HEADLESS_BUNDLE = "@deepseek-ai/dsh-headless";
export const WEB_APP_BUNDLE = "@deepseek-ai/dsh-web-app";

/**
 * headless profile 的补丁：恢复凭据三行（headless 默认关掉它们），
 * 再把 agent 的文件与 shell 钉在 workspace。
 */
export function runProfilePatchBody(workspaceRoot: string): string {
  return [
    "# 沙箱 headless 运行层",
    "- id: credentials",
    "  disabled: false",
    "- id: authorization",
    "  disabled: false",
    "- id: deepseek-account",
    "  disabled: false",
    "- id: sandbox-policy",
    "  config:",
    "    mode: workspace-write",
    `    workspaceRoot: ${JSON.stringify(workspaceRoot)}`,
    "- id: permission",
    "  config:",
    "    defaultPreset: workspace-write",
    "    presets:",
    "      read-only:",
    "        sandbox: read-only",
    "        approval: ask",
    "      workspace-write:",
    "        sandbox: workspace-write",
    "        approval: ask",
    "      danger-full-access:",
    "        sandbox: danger-full-access",
    "        approval: never",
    "",
  ].join("\n");
}

/** 启动参数。端口固定交给系统分配，避免与工作环境的 6945 撞车。 */
export const BOOT_ARGS = ["--profile", "sbx", "--port", "0", "--no-open"] as const;
export const DUMP_CONFIG_ARGS = ["--profile", "sbx", "--dump-config"] as const;
