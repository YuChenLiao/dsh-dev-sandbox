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
export const PROFILE_PATCH_BODY = "# 沙箱 profile 层：只放本实例的行\n[]\n";
export const API_KEY_ENV = "DEEPSEEK_API_KEY";

/** 启动参数。端口固定交给系统分配，避免与工作环境的 6945 撞车。 */
export const BOOT_ARGS = ["--profile", "sbx", "--port", "0", "--no-open"] as const;
export const DUMP_CONFIG_ARGS = ["--profile", "sbx", "--dump-config"] as const;
