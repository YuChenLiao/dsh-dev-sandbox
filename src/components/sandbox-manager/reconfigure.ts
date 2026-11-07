import path from "node:path";
import { COMMAND_TIMEOUT_MS } from "../../shared/config.ts";
import { runCommand, sandboxEnv } from "../../shared/process.ts";
import type { ReconfigureInput, ReconfigureResult } from "../../shared/types.ts";
import { DUMP_CONFIG_ARGS } from "./config.ts";
import { requireRecord } from "./inspect.ts";
import { createSandbox, destroySandbox } from "./lifecycle.ts";
import { profilePackageJson, resolveBundles } from "./profile.ts";
import type { ManagerContext } from "./types.ts";

/**
 * 改配置必须先过 --dump-config 预检：坏 bundle 或坏补丁行会让整个 profile 起不来，
 * 而模型不会去看日志。预检失败就把 package.json 回滚，磁盘上不留坏状态。
 */
export async function reconfigureSandbox(ctx: ManagerContext, input: ReconfigureInput): Promise<ReconfigureResult> {
  const record = await requireRecord(ctx, input.id);
  const profileDir = path.join(record.home, "profiles", record.profile);
  const packageFile = path.join(profileDir, "package.json");
  const bundles = input.bundles && input.bundles.length ? resolveBundles(input.bundles) : record.bundles;

  await import("node:fs/promises").then((fsp) => fsp.writeFile(packageFile, profilePackageJson(bundles)));

  const check = await runCommand([...DUMP_CONFIG_ARGS], {
    cwd: record.workspace,
    env: sandboxEnv(record.home, path.join(path.dirname(record.home), "agents")),
    stdio: ["ignore", "pipe", "pipe"],
  }, COMMAND_TIMEOUT_MS);

  if (check.code !== 0) {
    await import("node:fs/promises").then((fsp) => fsp.writeFile(packageFile, profilePackageJson(record.bundles)));
    const detail = (check.err || check.out).trim().split("\n").slice(-4).join(" | ");
    return { ok: false, stage: "dump-config", detail };
  }

  if (input.restart) {
    await destroySandbox(ctx, { id: record.id });
    const fresh = await createSandbox(ctx, { name: record.name, bundles });
    return { ok: true, restarted: fresh.id, port: fresh.port, bundles };
  }

  await ctx.state.update((state) => {
    const target = state.sandboxes.find((item) => item.id === record.id);
    if (target) target.bundles = bundles;
  });
  return { ok: true, bundles, requiresRestart: true };
}
