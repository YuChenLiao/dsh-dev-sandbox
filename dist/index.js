// src/shared/errors.ts
var SandboxError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "SandboxError";
  }
  code;
};
function asMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// src/shared/config.ts
var DEFAULT_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];
var SANDBOX_PROFILE = "sbx";
var STATE_FILE = "state.json";
var TRASH_PREFIX = ".trash-";
var KEEP_ENV = /* @__PURE__ */ new Set([
  "PATH",
  "SystemRoot",
  "windir",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "COMSPEC",
  "PATHEXT",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "HOMEDRIVE",
  "HOMEPATH",
  "LANG"
]);
var BOOT_TIMEOUT_MS = 9e4;
var READY_TIMEOUT_MS = 3e4;
var PORT_RELEASE_TIMEOUT_MS = 12500;
var COMMAND_TIMEOUT_MS = 6e4;
var PROBE_TIMEOUT_MS = 800;
var MAX_BODY_BYTES = 1 << 20;
var LISTEN_URL_PATTERN = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([\w-]+)/;
var BOOT_FAILURE_PATTERN = /failed to load|cannot resolve profile bundle|ERR_UNSUPPORTED/;

// src/shared/http.ts
function sendJson(res, code, value) {
  const body = JSON.stringify(value);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}
function readJsonBody(req) {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        fail(new SandboxError("\u8BF7\u6C42\u4F53\u8FC7\u5927", "body-too-large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) return done({});
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return fail(new SandboxError("\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F\u5BF9\u8C61", "body-not-object"));
        }
        done(parsed);
      } catch {
        fail(new SandboxError("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON", "body-not-json"));
      }
    });
    req.on("error", (error) => fail(error));
  });
}

// src/shared/paths.ts
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
function resolveRoot(explicit) {
  const raw = explicit ?? process.env.DSH_SANDBOX_ROOT ?? join(homedir(), ".dsh-dev-sandbox", "instances");
  return resolve(raw);
}
function insidePath(root, target) {
  const base = resolve(root) + sep;
  const real = resolve(target);
  if (!real.startsWith(base) && real !== resolve(root)) {
    throw new SandboxError(`\u8DEF\u5F84\u8D8A\u754C\uFF1A${real}`, "path-outside-root");
  }
  return real;
}
function workHome() {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

// src/shared/state.ts
import fsp from "node:fs/promises";
var StateStore = class {
  constructor(file) {
    this.file = file;
  }
  file;
  tail = Promise.resolve();
  async read() {
    try {
      const text = await fsp.readFile(this.file, "utf8");
      const parsed = JSON.parse(text);
      return { sandboxes: Array.isArray(parsed.sandboxes) ? parsed.sandboxes : [] };
    } catch {
      return { sandboxes: [] };
    }
  }
  async update(mutate) {
    const run = this.tail.then(async () => {
      const state = await this.read();
      const next = mutate(state) ?? state;
      await fsp.mkdir(this.file.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(next, null, 2));
      await fsp.rename(tmp, this.file);
      return next;
    });
    this.tail = run.catch(() => void 0);
    return run;
  }
};

// src/components/sandbox-manager/inspect.ts
import fs2 from "node:fs";

// src/shared/sessionLog.ts
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
var SESSION_FILE = /^session\.v\d+\.jsonl(\.zstd)?$/;
function listSessionFiles(home) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SESSION_FILE.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(home, "sessions"));
  return files;
}
function textOf(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => typeof part === "object" && part && "text" in part ? String(part.text ?? "") : "").join("");
  }
  return "";
}
function summarize(raw) {
  if (typeof raw !== "object" || raw === null) return { type: "unknown", text: "" };
  const event = raw;
  const data = typeof event.data === "object" && event.data ? event.data : {};
  const text = textOf(data.text) || textOf(data.content) || textOf(data.message);
  return {
    type: typeof event.type === "string" ? event.type : "unknown",
    seq: typeof event.seq === "number" ? event.seq : void 0,
    at: typeof event.time === "number" ? event.time : null,
    text: text.slice(0, 240)
  };
}
function readEvents(file, limit) {
  const raw = fs.readFileSync(file);
  const buffer = file.endsWith(".zstd") ? zlib.zstdDecompressSync(raw) : raw;
  const lines = buffer.toString("utf8").split("\n").filter(Boolean);
  const events = [];
  for (const line of lines.slice(-limit)) {
    try {
      events.push(summarize(JSON.parse(line)));
    } catch {
      events.push({ type: "unparsed", text: line.slice(0, 160) });
    }
  }
  return events;
}
function countLines(file) {
  const raw = fs.readFileSync(file);
  const buffer = file.endsWith(".zstd") ? zlib.zstdDecompressSync(raw) : raw;
  return buffer.toString("utf8").split("\n").filter(Boolean).length;
}
function newestSessionFile(home) {
  return listSessionFiles(home).map((file) => ({ file, at: fs.statSync(file).mtimeMs })).sort((a, b) => b.at - a.at)[0]?.file;
}

// src/shared/process.ts
import { spawn } from "node:child_process";
import net from "node:net";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function killTree(pid) {
  if (!pid) return;
  try {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  } catch {
  }
}
function portOpen(port) {
  return new Promise((done) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
    socket.once("timeout", () => {
      socket.destroy();
      done(false);
    });
  });
}
function sandboxEnv(home, agentsHome) {
  const out = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("DSH_")) continue;
    if (KEEP_ENV.has(key)) out[key] = value;
  }
  out.DSH_HOME = home;
  out.DSH_AGENTS_HOME = agentsHome;
  out.NO_COLOR = "1";
  out.FORCE_COLOR = "0";
  return out;
}
function spawnDsh(args, options) {
  const bin = process.env.DSH_SANDBOX_DSH_BIN;
  const stdio = options.stdio ?? ["ignore", "pipe", "pipe"];
  if (bin) {
    const env = { ...options.env, ELECTRON_RUN_AS_NODE: "1" };
    return spawn(process.execPath, [bin, ...args], { ...options, env, stdio, windowsHide: true });
  }
  const comspec = process.env.ComSpec ?? "cmd.exe";
  return spawn(comspec, ["/d", "/s", "/c", `dsh ${args.join(" ")}`], { ...options, stdio, windowsHide: true });
}
function runCommand(args, options, timeoutMs) {
  return new Promise((done) => {
    const child = spawnDsh(args, options);
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => {
      out += String(d);
    });
    child.stderr?.on("data", (d) => {
      err += String(d);
    });
    const timer = setTimeout(() => {
      killTree(child.pid);
      done({ code: null, out, err });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, out, err });
    });
  });
}

// src/components/sandbox-manager/inspect.ts
async function requireRecord(ctx, id) {
  const state = await ctx.state.read();
  const record = state.sandboxes.find((item) => item.id === id || item.name === id);
  if (!record) throw new Error(`\u6CA1\u6709\u8FD9\u4E2A\u6C99\u7BB1\uFF1A${id}`);
  return record;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function listSandboxes(ctx) {
  const state = await ctx.state.read();
  const views = [];
  for (const record of state.sandboxes) {
    const up = alive(record.pid);
    views.push({
      id: record.id,
      name: record.name,
      port: record.port,
      token: record.token,
      pid: record.pid,
      alive: up,
      listening: up ? await portOpen(record.port) : false,
      sessions: listSessionFiles(record.home).length,
      bundles: record.bundles,
      createdAt: record.createdAt
    });
  }
  return views;
}
async function readTail(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  const file = newestSessionFile(record.home);
  if (!file) return { sessions: 0, events: [] };
  const limit = Math.max(1, Math.min(200, input.limit ?? 24));
  return {
    sessions: listSessionFiles(record.home).length,
    session: file.split(/[\\/]/).slice(-2)[0],
    total: countLines(file),
    events: readEvents(file, limit)
  };
}
async function readLog(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  const lines = Math.max(1, Math.min(500, input.lines ?? 40));
  let text = "";
  try {
    text = fs2.readFileSync(record.logFile, "utf8");
  } catch {
    text = "";
  }
  return { text: text.split("\n").slice(-lines).join("\n") };
}

// src/components/sandbox-manager/lifecycle.ts
import fsp3 from "node:fs/promises";
import path3 from "node:path";

// src/components/sandbox-manager/boot.ts
import fs3 from "node:fs";

// src/components/sandbox-manager/config.ts
var INSTANCE_ID_PREFIX = "sbx-";
var INSTANCE_ID_LENGTH = 6;
var HOME_DIR = "home";
var WORKSPACE_DIR = "workspace";
var PROFILE_DIR = "profiles";
var PROFILE_AGENTS_DIR = "agents";
var PROFILE_NODE_MODULES = "node_modules";
var LOG_FILE = "boot.log";
var ENV_FILE = ".env";
var PROFILE_PACKAGE_NAME = "dsh-profile-sbx";
var PROFILE_PATCH_BODY = "# \u6C99\u7BB1 profile \u5C42\uFF1A\u53EA\u653E\u672C\u5B9E\u4F8B\u7684\u884C\n[]\n";
var API_KEY_ENV = "DEEPSEEK_API_KEY";
var BOOT_ARGS = ["--profile", "sbx", "--port", "0", "--no-open"];
var DUMP_CONFIG_ARGS = ["--profile", "sbx", "--dump-config"];

// src/components/sandbox-manager/boot.ts
async function boot(paths, env) {
  fs3.writeFileSync(paths.logFile, "");
  const child = spawnDsh([...BOOT_ARGS], { cwd: paths.workspace, env, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  const collect = (chunk) => {
    const text = String(chunk);
    buffer += text;
    try {
      fs3.appendFileSync(paths.logFile, text);
    } catch {
    }
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  try {
    const { port, token } = await waitForUrl(() => buffer);
    const ready = await waitForReady(port, token);
    return { child, buffer: () => buffer, port, token, ready };
  } catch (error) {
    killTree(child.pid);
    throw error;
  }
}
async function waitForUrl(read) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const text = read();
    const match = text.match(LISTEN_URL_PATTERN);
    if (match?.[1] && match[2]) return { port: Number(match[1]), token: match[2] };
    if (BOOT_FAILURE_PATTERN.test(text)) {
      throw new SandboxError(`\u6C99\u7BB1\u542F\u52A8\u5931\u8D25\uFF1A${tail(text)}`, "boot-failed");
    }
    await sleep(300);
  }
  throw new SandboxError("\u6C99\u7BB1\u5728 90 \u79D2\u5185\u6CA1\u6709\u62A5\u544A\u76D1\u542C\u5730\u5740", "boot-timeout");
}
async function waitForReady(port, token) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await portOpen(port)) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, { redirect: "manual" });
        if (response.status < 500) return true;
      } catch {
      }
    }
    await sleep(400);
  }
  return false;
}
function tail(text) {
  return text.trim().split("\n").slice(-3).join(" | ");
}

// src/components/sandbox-manager/profile.ts
import fsp2 from "node:fs/promises";
import path2 from "node:path";
function profilePackageJson(bundles) {
  const useBundles = bundles.length ? bundles : DEFAULT_BUNDLES;
  return `${JSON.stringify({
    name: PROFILE_PACKAGE_NAME,
    private: true,
    dsh: { profile: { bundles: [...useBundles] } }
  }, null, 2)}
`;
}
function resolveBundles(bundles) {
  return bundles && bundles.length ? [...bundles] : [...DEFAULT_BUNDLES];
}
async function writeProfile(paths, bundles) {
  await fsp2.mkdir(paths.profileDir, { recursive: true });
  await fsp2.mkdir(paths.workspace, { recursive: true });
  await fsp2.mkdir(paths.agentsHome, { recursive: true });
  await fsp2.writeFile(path2.join(paths.profileDir, "package.json"), profilePackageJson(bundles));
  const patch = path2.join(paths.profileDir, "cordis.patch.yml");
  const exists = await fsp2.access(patch).then(() => true).catch(() => false);
  if (!exists) await fsp2.writeFile(patch, PROFILE_PATCH_BODY);
}
async function writeEnvFile(paths, apiKey) {
  if (!apiKey) return;
  await fsp2.writeFile(path2.join(paths.home, ENV_FILE), `${API_KEY_ENV}=${apiKey}
`);
}
async function ensureModuleResolution(paths) {
  const link = path2.join(paths.home, "profiles", PROFILE_NODE_MODULES);
  const shared = path2.join(workHome(), "profiles", PROFILE_NODE_MODULES);
  const linked = await fsp2.access(link).then(() => true).catch(() => false);
  if (linked) return;
  const available = await fsp2.access(shared).then(() => true).catch(() => false);
  if (!available) return;
  await fsp2.symlink(shared, link, "junction").catch(() => void 0);
}

// src/components/sandbox-manager/lifecycle.ts
function newInstanceId() {
  return `${INSTANCE_ID_PREFIX}${Math.random().toString(16).slice(2, 2 + INSTANCE_ID_LENGTH)}`;
}
function instancePaths(root, id) {
  const dir = insidePath(root, path3.join(root, id));
  const home = path3.join(dir, HOME_DIR);
  return {
    dir,
    home,
    workspace: path3.join(dir, WORKSPACE_DIR),
    profileDir: path3.join(home, PROFILE_DIR, SANDBOX_PROFILE),
    logFile: path3.join(dir, LOG_FILE),
    agentsHome: path3.join(dir, PROFILE_AGENTS_DIR)
  };
}
async function createSandbox(ctx, input) {
  const id = newInstanceId();
  const paths = instancePaths(ctx.root, id);
  const bundles = resolveBundles(input.bundles);
  const env = sandboxEnv(paths.home, paths.agentsHome);
  try {
    await writeProfile(paths, bundles);
    await writeEnvFile(paths, input.apiKey);
    await ensureModuleResolution(paths);
    const booted = await boot(paths, env);
    const record = {
      id,
      name: input.name?.trim() || id,
      home: paths.home,
      workspace: paths.workspace,
      logFile: paths.logFile,
      profile: SANDBOX_PROFILE,
      bundles,
      port: booted.port,
      token: booted.token,
      pid: booted.child.pid ?? 0,
      createdAt: Date.now(),
      ready: booted.ready
    };
    await ctx.state.update((state) => {
      state.sandboxes.push(record);
    });
    return record;
  } catch (error) {
    await sleep(600);
    await fsp3.rm(paths.dir, { recursive: true, force: true, maxRetries: 4 }).catch(() => void 0);
    throw error;
  }
}
async function destroySandbox(ctx, input) {
  const state = await ctx.state.read();
  const record = state.sandboxes.find((item) => item.id === input.id || item.name === input.id);
  if (!record) throw new Error(`\u6CA1\u6709\u8FD9\u4E2A\u6C99\u7BB1\uFF1A${input.id}`);
  killTree(record.pid);
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline && await portOpen(record.port)) await sleep(250);
  const trash = insidePath(ctx.root, path3.join(ctx.root, `${TRASH_PREFIX}${path3.basename(record.home)}-${Date.now()}`));
  const instanceDir = path3.dirname(record.home);
  const exists = await fsp3.access(instanceDir).then(() => true).catch(() => false);
  if (exists) {
    await fsp3.rename(instanceDir, trash).catch(() => void 0);
    await fsp3.rm(trash, { recursive: true, force: true, maxRetries: 5 }).catch(() => void 0);
  }
  await ctx.state.update((next) => {
    next.sandboxes = next.sandboxes.filter((item) => item.id !== record.id);
  });
  return { destroyed: record.id, portClosed: !await portOpen(record.port) };
}

// src/components/sandbox-manager/reconfigure.ts
import path4 from "node:path";
async function reconfigureSandbox(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  const profileDir = path4.join(record.home, "profiles", record.profile);
  const packageFile = path4.join(profileDir, "package.json");
  const bundles = input.bundles && input.bundles.length ? resolveBundles(input.bundles) : record.bundles;
  await import("node:fs/promises").then((fsp4) => fsp4.writeFile(packageFile, profilePackageJson(bundles)));
  const check = await runCommand([...DUMP_CONFIG_ARGS], {
    cwd: record.workspace,
    env: sandboxEnv(record.home, path4.join(path4.dirname(record.home), "agents")),
    stdio: ["ignore", "pipe", "pipe"]
  }, COMMAND_TIMEOUT_MS);
  if (check.code !== 0) {
    await import("node:fs/promises").then((fsp4) => fsp4.writeFile(packageFile, profilePackageJson(record.bundles)));
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

// src/components/sandbox-manager/manager.ts
import path5 from "node:path";
function createManager(root = resolveRoot()) {
  const ctx = { root, state: new StateStore(path5.join(root, STATE_FILE)) };
  return {
    root,
    create: (input) => createSandbox(ctx, input),
    list: () => listSandboxes(ctx),
    destroy: (input) => destroySandbox(ctx, input),
    reconfigure: (input) => reconfigureSandbox(ctx, input),
    tail: (input) => readTail(ctx, input),
    log: (input) => readLog(ctx, input)
  };
}

// src/components/sandbox-manager/routes.ts
function asId(body) {
  const id = body.id;
  if (typeof id !== "string" || !id.trim()) throw new SandboxError("\u7F3A\u5C11 id", "missing-id");
  return id.trim();
}
function asBundles(value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) throw new SandboxError("bundles \u5FC5\u987B\u662F\u6570\u7EC4", "bad-bundles");
  return value.map((item) => String(item)).map((item) => item.trim()).filter(Boolean);
}
async function dispatch(manager, method, route, query, body) {
  if (route === "list" && method === "GET") {
    return { root: manager.root, sandboxes: await manager.list() };
  }
  if (route === "tail" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("\u7F3A\u5C11 id", "missing-id");
    return manager.tail({ id, limit: Number(query.get("limit") ?? 24) });
  }
  if (route === "log" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("\u7F3A\u5C11 id", "missing-id");
    return manager.log({ id, lines: Number(query.get("lines") ?? 40) });
  }
  if (route === "create" && method === "POST") {
    const payload = await body();
    return { sandbox: await manager.create({
      name: typeof payload.name === "string" ? payload.name : void 0,
      bundles: asBundles(payload.bundles),
      apiKey: typeof payload.apiKey === "string" ? payload.apiKey : void 0
    }) };
  }
  if (route === "destroy" && method === "POST") {
    return manager.destroy({ id: asId(await body()) });
  }
  if (route === "config" && method === "POST") {
    const payload = await body();
    return manager.reconfigure({
      id: asId(payload),
      bundles: asBundles(payload.bundles),
      restart: payload.restart === true
    });
  }
  throw new SandboxError(`\u672A\u77E5\u8DEF\u7531\uFF1A${route || "/"}`, "unknown-route");
}

// src/components/sandbox-manager/register.ts
var ROUTE_PREFIX = "/__sbx";
function registerSandboxManager(ctx) {
  const web = ctx.get("webServer");
  if (!web) return;
  const manager = createManager();
  const handler = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = url.pathname.replace(/^\/__sbx\/?/, "");
    try {
      const result = await dispatch(manager, req.method ?? "GET", route, url.searchParams, () => readJsonBody(req));
      sendJson(res, 200, { ok: true, ...typeof result === "object" && result ? result : { value: result } });
    } catch (error) {
      const status = error instanceof SandboxError && error.code === "unknown-route" ? 404 : 500;
      sendJson(res, status, { ok: false, error: asMessage(error) });
    }
  };
  const dispose = web.register({ kind: "prefix", path: ROUTE_PREFIX, handler });
  ctx.effect?.(() => () => dispose());
}

// src/entries/host.ts
function apply(ctx) {
  registerSandboxManager(ctx);
}
export {
  apply
};
