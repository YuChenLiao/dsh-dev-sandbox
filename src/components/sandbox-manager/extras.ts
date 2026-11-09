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
  McpEntry,
} from "../../shared/types.ts";
import { PROFILE_DIR, RUN_PROFILE, profilePatchBody, runProfilePatchBody } from "./config.ts";
import { requireRecord } from "./inspect.ts";
import { instancePaths } from "./lifecycle.ts";
import type { ManagerContext } from "./types.ts";

// 首字符必须是字母数字，并显式排除 `.` / `..`：单独一个 `..` 会让 path.join
// 归一化到 skills 根之上，后续 rm 会删掉整个实例 home。
const SKILL_NAME = /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/;
/** findSkill 的目录预算：超大 monorepo 里宁可报「找不到」也不扫几万个目录。 */
const FIND_SKILL_DIR_BUDGET = 5000;

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
async function writePatches(ctx: ManagerContext, id: string, workspace: string, mcp: readonly McpEntry[]): Promise<void> {
  const paths = instancePaths(ctx.root, id);
  const webProfile = path.join(paths.home, PROFILE_DIR, SANDBOX_PROFILE);
  await fsp.mkdir(webProfile, { recursive: true });
  await fsp.writeFile(path.join(webProfile, "cordis.patch.yml"), profilePatchBody(workspace, mcp));

  const runProfile = path.join(paths.home, PROFILE_DIR, RUN_PROFILE);
  await fsp.mkdir(runProfile, { recursive: true });
  await fsp.writeFile(path.join(runProfile, "cordis.patch.yml"), runProfilePatchBody(workspace, mcp));
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
  await writePatches(ctx, record.id, record.workspace, next);

  return { servers: next.map((entry) => entry.serverName), requiresRestart: true };
}
