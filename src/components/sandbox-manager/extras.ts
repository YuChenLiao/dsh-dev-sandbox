import fsp from "node:fs/promises";
import path from "node:path";
import { SANDBOX_PROFILE } from "../../shared/config.ts";
import { SandboxError } from "../../shared/errors.ts";
import { insidePath } from "../../shared/paths.ts";
import type {
  AddMcpInput,
  AddMcpResult,
  AddSkillInput,
  AddSkillResult,
  LogInput,
  LogResult,
  McpEntry,
  ReadEntry,
  ReadInput,
  ReadResult,
  UsePresetInput,
  UsePresetResult,
} from "../../shared/types.ts";
import { readLog, requireRecord } from "./inspect.ts";
import { PROFILE_DIR, RUN_PROFILE, profilePatchBody, runProfilePatchBody } from "./config.ts";
import { instancePaths } from "./lifecycle.ts";
import type { ManagerContext } from "./types.ts";

// 首字符必须是字母数字，并显式排除 `.` / `..`：单独一个 `..` 会让 path.join
// 归一化到 skills 根之上，后续 rm 会删掉整个实例 home。
const SKILL_NAME = /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/;
/** findSkill 的目录预算：超大 monorepo 里宁可报「找不到」也不扫几万个目录。 */
const FIND_SKILL_DIR_BUDGET = 5000;
const READ_DEFAULT_BYTES = 64 * 1024;
const READ_MAX_BYTES = 1024 * 1024;

/**
 * 读沙箱 workspace 里的文件或列目录。
 *
 * 这是判「插件写了什么」的唯一通路：产物（配置、缓存、生成的日志）都在 workspace 里，
 * 让沙箱里的模型自己 cat 再复述会失真。路径一律相对 workspace 且经 insidePath 收口，
 * 出不了这个目录。
 */
export async function readWorkspace(ctx: ManagerContext, input: ReadInput): Promise<ReadResult> {
  const record = await requireRecord(ctx, input.id);
  const root = record.workspace;
  const relative = (input.path ?? "").trim().replace(/^[\\/]+/, "") || ".";
  const target = insidePath(root, path.join(root, relative));

  const stat = await fsp.lstat(target).catch(() => undefined);
  if (!stat) throw new SandboxError(`沙箱 workspace 里没有这个路径：${relative}`, "path-not-found");
  // 不跟随链接：workspace 里如果有一个指向外部的 junction，open 会照着读出去。
  if (stat.isSymbolicLink()) {
    throw new SandboxError(`不跟随符号链接：${relative}`, "symlink-not-allowed");
  }

  if (stat.isDirectory()) {
    const entries = await fsp.readdir(target, { withFileTypes: true });
    const list: ReadEntry[] = [];
    for (const entry of entries.slice(0, 500)) {
      const full = path.join(target, entry.name);
      const info = await fsp.lstat(full).catch(() => undefined);
      list.push({
        name: entry.name,
        kind: entry.isDirectory() ? "dir" : "file",
        size: info?.size ?? 0,
      });
    }
    return { path: relative, kind: "dir", entries: list, truncated: entries.length > 500 };
  }

  const limit = Math.max(1, Math.min(READ_MAX_BYTES, input.maxBytes ?? READ_DEFAULT_BYTES));
  const handle = await fsp.open(target, "r");
  try {
    const buffer = Buffer.alloc(Math.min(limit, stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return {
      path: relative,
      kind: "file",
      text: buffer.subarray(0, bytesRead).toString("utf8"),
      bytes: stat.size,
      truncated: stat.size > bytesRead,
    };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/**
 * 读启动日志的尾部。`status` 只给错误行，排障时经常需要完整上下文。
 * 默认 120 行：工具的入参说明写的就是这个数，不给默认值会退到 readLog 的 40。
 */
export async function readBootLog(ctx: ManagerContext, input: LogInput): Promise<LogResult> {
  return readLog(ctx, { ...input, lines: Math.max(1, Math.min(500, input.lines ?? 120)) });
}

/**
 * 在工作目录里找 skill 目录：任意层的 `skills/<name>/SKILL.md` 或 `<name>/SKILL.md`。
 * 有界递归（深度 4、跳过 node_modules 与 .git），因为实际布局五花八门——
 * 例如 `<repo>/vendor/<pkg>/skills/<name>` 也应当能装。
 */
async function findSkill(
  name: string,
  root: string,
  depth = 0,
  budget = { left: FIND_SKILL_DIR_BUDGET },
): Promise<string | undefined> {
  if (depth > 4 || budget.left <= 0) return undefined;
  budget.left -= 1;
  for (const candidate of [path.join(root, "skills", name), path.join(root, name)]) {
    const hit = await fsp.readFile(path.join(candidate, "SKILL.md"), "utf8").catch(() => undefined);
    if (hit !== undefined) return candidate;
  }
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
    const found = await findSkill(name, path.join(root, entry.name), depth + 1, budget);
    if (found) return found;
  }
  if (budget.left <= 0) {
    throw new SandboxError(
      `在工作目录里查找 skill 时扫了 ${FIND_SKILL_DIR_BUDGET} 个目录仍未找到，已停止（工作区太大）`,
      "skill-search-exhausted",
    );
  }
  return undefined;
}

async function resolveSkillSource(name: string, workspaceDir: string | undefined): Promise<string> {
  const roots = [workspaceDir, process.cwd()].filter((item): item is string => Boolean(item));
  for (const root of roots) {
    const found = await findSkill(name, root);
    if (found) return found;
  }
  throw new SandboxError(
    `找不到 skill「${name}」（在工作目录与宿主 cwd 下按 <任意>/skills/${name} 或 <任意>/${name} 找 SKILL.md 都没有）`,
    "skill-not-found",
  );
}

/**
 * 把 skill 挂进沙箱：链到 `<sandbox home>/skills/<name>`。
 * 那是 dsh-skill-filesystem 的 user root（`<dshHome>/skills`），沙箱 home 独立，
 * 因此只影响这个实例；web profile 与 headless run profile 读同一个 home，两边都生效。
 */
export async function addSkill(ctx: ManagerContext, input: AddSkillInput): Promise<AddSkillResult> {
  const name = (input.name ?? "").trim();
  if (!SKILL_NAME.test(name)) throw new SandboxError(`skill 名不合法：${name}`, "invalid-skill-name");

  const record = await requireRecord(ctx, input.id);
  const source = await resolveSkillSource(name, ctx.workspaceDir ? await ctx.workspaceDir() : undefined);

  // 收口到 skills 根：insidePath 对「等于根」是放行的（destroy 需要），
  // 所以这里再断言目标的父目录就是 skills 根，避免 name 把路径抬到根之上。
  const skillsRoot = path.join(record.home, "skills");
  await fsp.mkdir(skillsRoot, { recursive: true });
  const target = insidePath(skillsRoot, path.join(skillsRoot, name));
  if (target === skillsRoot || path.dirname(target) !== skillsRoot) {
    throw new SandboxError(`skill 名不合法：${name}`, "invalid-skill-name");
  }

  const existing = await fsp.lstat(target).catch(() => undefined);
  if (existing) await fsp.rm(target, { recursive: true, force: true });
  await fsp.symlink(source, target, "junction");

  return { name, source, requiresRestart: false };
}

/** 重写两套补丁：web profile 与 headless run profile 各一份，漏一份就会「装上但看不到」。 */
async function writePatches(
  ctx: ManagerContext,
  id: string,
  workspace: string,
  mcp: readonly McpEntry[],
  presetYaml?: string,
): Promise<void> {
  const paths = instancePaths(ctx.root, id);
  const webProfile = path.join(paths.home, PROFILE_DIR, SANDBOX_PROFILE);
  await fsp.mkdir(webProfile, { recursive: true });
  await fsp.writeFile(path.join(webProfile, "cordis.patch.yml"), profilePatchBody(workspace, mcp));

  const runProfile = path.join(paths.home, PROFILE_DIR, RUN_PROFILE);
  await fsp.mkdir(runProfile, { recursive: true });
  await fsp.writeFile(path.join(runProfile, "cordis.patch.yml"), runProfilePatchBody(workspace, mcp, presetYaml));
}

/**
 * 把工作环境某个 agent preset 的插件行物化进沙箱的 run profile。
 *
 * 为什么需要这一步：`dsh-headless` 没有预设组合器，带 preset 的会话会被拒绝
 * （见 `dsh-headless/lib/index.js` 的 `assertAdoptable`，0.2.2-rc.1 原文是
 * `runs under agent preset …, which the one-shot runner does not compose`）。
 * 结果就是 preset 里注册的技能/工具进不了 agent 的 scope 链，读取方只看得到 global 段。
 * 物化到 profile 层之后，这些插件以全局身份加载，agent 就能看到。
 *
 * 代价：插件的 scope 身份从 preset 层变成 profile 层，`scopeOf(ctx)` 不再返回 preset key。
 * 这条只验「贡献能不能进 agent」，不验「scope 语义对不对」。
 * 也只写 run profile——沙箱自己的 web 实例不加载这些行。
 */
export async function usePreset(ctx: ManagerContext, input: UsePresetInput): Promise<UsePresetResult> {
  const presetId = (input.preset ?? "").trim();
  if (!presetId) throw new SandboxError("preset 不能为空", "missing-preset");
  if (!ctx.resolvePreset) {
    throw new SandboxError("读不到工作环境的 agentPresets 服务", "preset-unavailable");
  }

  const record = await requireRecord(ctx, input.id);
  const yaml = await ctx.resolvePreset(presetId);
  if (!yaml) throw new SandboxError(`工作环境里没有可读的 preset「${presetId}」`, "preset-not-found");

  // 先写补丁再记账本：写盘失败时账本不会被改成「已物化」。
  await writePatches(ctx, record.id, record.workspace, record.mcp ?? [], yaml);
  await ctx.state.update((state) => {
    const target = state.sandboxes.find((item) => item.id === record.id);
    if (target) target.preset = { source: presetId, yaml };
  });

  const rows = yaml.split("\n").filter((line) => /^\s*-\s+\S/.test(line)).length;
  return { preset: presetId, rows, requiresRestart: true };
}

/**
 * 给沙箱配一个 MCP server：登记进账本，再重写两套 profile 补丁。
 * 同名 server 会被覆盖（便于改配置），其余保留。装完要重启实例才生效。
 */
export async function addMcp(ctx: ManagerContext, input: AddMcpInput): Promise<AddMcpResult> {
  const serverName = (input.serverName ?? "").trim();
  if (!SERVER_NAME.test(serverName)) {
    throw new SandboxError(`serverName 不合法：${serverName}（只允许字母数字、下划线、连字符，1–32 位）`, "invalid-server-name");
  }
  if (typeof input.config !== "object" || input.config === null || Array.isArray(input.config)) {
    throw new SandboxError("config 必须是一个对象", "invalid-mcp-config");
  }

  const record = await requireRecord(ctx, input.id);
  const config = { ...input.config, serverName };
  const next: McpEntry[] = [
    ...(record.mcp ?? []).filter((entry) => entry.serverName !== serverName),
    { serverName, config },
  ];

  await ctx.state.update((state) => {
    const target = state.sandboxes.find((item) => item.id === record.id);
    if (target) target.mcp = next;
  });
  await writePatches(ctx, record.id, record.workspace, next, record.preset?.yaml);

  return { servers: next.map((entry) => entry.serverName), requiresRestart: true };
}
