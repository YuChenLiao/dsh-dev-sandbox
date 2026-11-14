// src/shared/errors.ts
var SandboxError = class extends Error {
  constructor(message, code, raw = false) {
    super(raw ? message : `[${code}] ${message}`);
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
var PACKAGE_NAME = /^(?:@[A-Za-z0-9][\w.-]*\/)?[A-Za-z0-9][\w.-]*$/;

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

// src/shared/routes.ts
var ROUTE_PREFIX = "/__sbx";
var STYLESHEET_ROUTE = "panel.css";
var PREFIX_PATTERN = new RegExp(`^${ROUTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`);
function stripRoutePrefix(pathname) {
  return pathname.replace(PREFIX_PATTERN, "");
}

// src/components/sandbox-manager/assets.ts
import fsp from "node:fs/promises";
var STYLESHEET_URL = new URL("./panel.css", import.meta.url);
function readStylesheet() {
  return fsp.readFile(STYLESHEET_URL, "utf8");
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
import fsp2 from "node:fs/promises";
var StateStore = class {
  constructor(file) {
    this.file = file;
  }
  file;
  tail = Promise.resolve();
  async read() {
    try {
      const text = await fsp2.readFile(this.file, "utf8");
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
      await fsp2.mkdir(this.file.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fsp2.writeFile(tmp, JSON.stringify(next, null, 2));
      await fsp2.rename(tmp, this.file);
      return next;
    });
    this.tail = run.catch(() => void 0);
    return run;
  }
};

// src/components/sandbox-manager/inspect.ts
import fs3 from "node:fs";

// src/shared/sessionLog.ts
import fs from "node:fs";
import fsp3 from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
var SESSION_FILE = /^session(\.[\w-]+)?\.jsonl(\.zstd)?$/;
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
    return value.map((part) => textOf(part?.text)).join("");
  }
  if (typeof value === "object" && value !== null) {
    const record = value;
    return textOf(record.content) || textOf(record.text);
  }
  return "";
}
function summarize(raw) {
  if (typeof raw !== "object" || raw === null) return { type: "unknown", text: "" };
  const event = raw;
  const data = typeof event.data === "object" && event.data ? event.data : {};
  const type = typeof event.type === "string" ? event.type : "unknown";
  const base = {
    type,
    seq: typeof event.seq === "number" ? event.seq : void 0,
    at: typeof event.time === "number" ? event.time : null
  };
  if (type === "tool/call") {
    const name = String(data.name ?? "tool");
    const raw2 = data.arguments;
    const args = (typeof raw2 === "string" ? raw2 : JSON.stringify(raw2 ?? "")).replace(/\s+/g, " ");
    return { ...base, text: `${name}(${args.slice(0, 200)})`.slice(0, 240) };
  }
  if (type === "tool/result") {
    const message = typeof data.message === "object" && data.message ? data.message : {};
    const prefix = data.error || message.isError ? "error: " : "";
    return { ...base, text: (prefix + textOf(message.content)).slice(0, 240) };
  }
  const text = textOf(data.text) || textOf(data.content) || textOf(data.message);
  return { ...base, text: text.slice(0, 240) };
}
var ZSTD_MAGIC = 4247762216;
var ZSTD_MAGIC_BYTES = [40, 181, 47, 253];
function scanFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) break;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break;
    offset += 4;
    if (offset === buffer.length) break;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) break;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) break;
    offset += remainingHeaderBytes;
    let torn = false;
    for (; ; ) {
      if (buffer.length - offset < 3) {
        torn = true;
        break;
      }
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = blockHeader >>> 1 & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) {
        torn = true;
        break;
      }
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) {
        torn = true;
        break;
      }
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (torn) break;
    if (checksum) {
      if (buffer.length - offset < 4) break;
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}
function decodeZstdFrames(raw) {
  const parts = [];
  for (const frame of scanFrames(raw)) {
    try {
      parts.push(zlib.zstdDecompressSync(raw.subarray(frame.start, frame.end)));
    } catch {
    }
  }
  return Buffer.concat(parts);
}
function readContainer(raw) {
  if (raw.length >= 4 && raw.readUInt32LE(0) === ZSTD_MAGIC) return decodeZstdFrames(raw);
  const at = raw.indexOf(Buffer.from(ZSTD_MAGIC_BYTES));
  if (at < 0) return raw;
  const prefix = raw.subarray(0, at);
  const paddingOnly = prefix.every((byte) => byte === 0 || byte === 32 || byte === 10 || byte === 13);
  if (!paddingOnly) return raw;
  const decoded = decodeZstdFrames(raw.subarray(at));
  return decoded.length > 0 ? decoded : Buffer.alloc(0);
}
async function readSession(file, limit) {
  const raw = await fsp3.readFile(file);
  const lines = readContainer(raw).toString("utf8").split("\n").filter(Boolean);
  const events = [];
  for (const line of lines.slice(-limit)) {
    try {
      events.push(summarize(JSON.parse(line)));
    } catch {
      events.push({ type: "unparsed", text: line.slice(0, 160) });
    }
  }
  return { total: lines.length, events };
}
function newestSessionFile(home) {
  return listSessionFiles(home).map((file) => ({ file, at: fs.statSync(file).mtimeMs })).sort((a, b) => b.at - a.at)[0]?.file;
}

// src/shared/process.ts
import { spawn } from "node:child_process";
import fs2 from "node:fs";
import net from "node:net";
import path2 from "node:path";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function killTree(pid) {
  if (!pid) return;
  try {
    const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    child.on("error", () => void 0);
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
function dshBinPath() {
  const explicit = process.env.DSH_SANDBOX_DSH_BIN;
  if (explicit) return explicit;
  const self = process.argv[1];
  if (self && /[\\/]dsh[\\/]lib[\\/]bin\.js$/.test(self) && fs2.existsSync(self) && isDshPackage(self)) {
    return self;
  }
  for (const dir of (process.env.PATH ?? "").split(path2.delimiter)) {
    if (!dir) continue;
    const candidate = path2.join(dir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (fs2.existsSync(candidate)) return candidate;
  }
  throw new SandboxError(
    "\u627E\u4E0D\u5230 dsh \u7684 bin.js\uFF1A\u8BBE DSH_SANDBOX_DSH_BIN \u6307\u5411 @deepseek-ai/dsh/lib/bin.js\uFF08\u684C\u9762\u7248\u7684\u526F\u672C\u5728 app.asar \u91CC\uFF0C\u9700\u8981\u663E\u5F0F\u6307\u5B9A\u8DEF\u5F84\uFF09",
    "dsh-bin-missing"
  );
}
function isDshPackage(binPath) {
  try {
    const manifest = JSON.parse(fs2.readFileSync(path2.join(path2.dirname(binPath), "..", "package.json"), "utf8"));
    return manifest.name === "@deepseek-ai/dsh";
  } catch {
    return false;
  }
}
function nodeExecutable() {
  const explicit = process.env.DSH_SANDBOX_DSH_NODE;
  if (explicit) return explicit;
  const names = process.platform === "win32" ? ["node.exe", "node.cmd"] : ["node"];
  for (const dir of (process.env.PATH ?? "").split(path2.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path2.join(dir, name);
      if (fs2.existsSync(candidate)) return candidate;
    }
  }
  throw new SandboxError("PATH \u4E0A\u627E\u4E0D\u5230 node\uFF0C\u65E0\u6CD5\u542F\u52A8 dsh", "node-missing");
}
function runtimeDescription() {
  return `node=${nodeExecutable()} dsh=${dshBinPath()}`;
}
function spawnDsh(args, options) {
  const stdio = options.stdio ?? ["ignore", "pipe", "pipe"];
  const env = { ...options.env, ELECTRON_RUN_AS_NODE: "1" };
  return spawn(nodeExecutable(), [dshBinPath(), ...args], { ...options, env, stdio, windowsHide: true });
}
function runCommand(args, options, timeoutMs) {
  return new Promise((done, fail) => {
    let child;
    try {
      child = spawnDsh(args, options);
    } catch (error) {
      fail(error);
      return;
    }
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
    child.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
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
  if (!pid) return false;
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
  const files = listSessionFiles(record.home);
  if (files.length === 0) return { sessions: 0, events: [] };
  const wanted = input.session?.trim();
  const file = wanted ? files.find((item) => item.split(/[\\/]/).slice(-2)[0] === wanted) : newestSessionFile(record.home);
  if (!file) {
    throw new SandboxError(`\u6CA1\u6709\u8FD9\u4E2A\u4F1A\u8BDD\uFF1A${wanted}`, "session-not-found");
  }
  const limit = Math.max(1, Math.min(200, input.limit ?? 24));
  const page = await readSession(file, limit);
  return {
    sessions: files.length,
    session: file.split(/[\\/]/).slice(-2)[0],
    total: page.total,
    events: page.events
  };
}
async function readLog(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  const lines = Math.max(1, Math.min(500, input.lines ?? 40));
  let text = "";
  try {
    text = fs3.readFileSync(record.logFile, "utf8");
  } catch {
    text = "";
  }
  return { text: text.split("\n").slice(-lines).join("\n") };
}

// src/components/sandbox-manager/extras.ts
import fsp6 from "node:fs/promises";
import path5 from "node:path";

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
var PROFILE_PATCH_HEADER = "# \u6C99\u7BB1 profile \u5C42\uFF1A\u672C\u5B9E\u4F8B\u7684\u7EA6\u675F\u4E0E\u63D2\u4EF6\u884C";
var API_KEY_ENV = "DEEPSEEK_API_KEY";
function mcpLines(mcp) {
  const lines = [];
  for (const entry of mcp ?? []) {
    lines.push(
      "- insert:",
      `    - id: mcp-${entry.serverName}`,
      '      name: "@deepseek-ai/dsh-mcp-client"',
      `      config: ${JSON.stringify(entry.config)}`
    );
  }
  return lines;
}
function presetLines(yaml) {
  const body = (yaml ?? "").trim();
  if (!body) return [];
  const firstLine = body.split("\n").find((line) => line.trim());
  if (!firstLine || !firstLine.trimStart().startsWith("-")) {
    throw new Error("preset \u5185\u5BB9\u4E0D\u662F\u9876\u5C42 entry-list\uFF0C\u65E0\u6CD5\u7269\u5316");
  }
  return ["- insert:", ...body.split("\n").map((line) => line.trim() ? `    ${line}` : line)];
}
function profilePatchBody(workspaceRoot, mcp) {
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
    ...mcpLines(mcp),
    ""
  ].join("\n");
}
var CREDENTIALS_FILE = ".credentials.yaml";
var BROWSER_SESSION_RECORD = "client-connection/browser-session";
var PLATFORM_ACCOUNT_PREFIX = "deepseek-account-platform/";
var RUN_PROFILE = "run";
var HEADLESS_BUNDLE = "@deepseek-ai/dsh-headless";
var WEB_APP_BUNDLE = "@deepseek-ai/dsh-web-app";
function runProfilePatchBody(workspaceRoot, mcp, presetYaml) {
  return [
    "# \u6C99\u7BB1 headless \u8FD0\u884C\u5C42",
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
    ...mcpLines(mcp),
    // headless 的组合器不认 agent preset（`assertAdoptable` 会直接拒绝带 preset 的会话），
    // 所以 preset 里注册的插件进不了 agent 的 scope 链。物化到 profile 层之后它们以
    // 全局身份加载，`collectFresh` 的 global 段就能看到它们。
    ...presetLines(presetYaml),
    ""
  ].join("\n");
}
var BOOT_ARGS = ["--profile", "sbx", "--port", "0", "--no-open"];
var DUMP_CONFIG_ARGS = ["--profile", "sbx", "--dump-config"];

// src/components/sandbox-manager/lifecycle.ts
import fsp5 from "node:fs/promises";
import path4 from "node:path";

// src/components/sandbox-manager/boot.ts
import fs4 from "node:fs";
async function boot(paths, env) {
  const runtime = runtimeDescription();
  fs4.writeFileSync(paths.logFile, `[sandbox] runtime: ${runtime}
`);
  const child = spawnDsh([...BOOT_ARGS], { cwd: paths.workspace, env, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  const collect = (chunk) => {
    const text = String(chunk);
    buffer += text;
    try {
      fs4.appendFileSync(paths.logFile, text);
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
import fsp4 from "node:fs/promises";
import path3 from "node:path";
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
  if (!bundles || bundles.length === 0) return [...DEFAULT_BUNDLES];
  const invalid = bundles.filter((item) => !PACKAGE_NAME.test(item));
  if (invalid.length > 0) {
    throw new SandboxError(`bundle \u4E0D\u662F\u5408\u6CD5\u5305\u540D\uFF1A${invalid.join(", ")}`, "invalid-bundle");
  }
  return [...bundles];
}
async function writeProfile(paths, bundles, mcp) {
  await fsp4.mkdir(paths.profileDir, { recursive: true });
  await fsp4.mkdir(paths.workspace, { recursive: true });
  await fsp4.mkdir(paths.agentsHome, { recursive: true });
  await fsp4.writeFile(path3.join(paths.profileDir, "package.json"), profilePackageJson(bundles));
  await fsp4.writeFile(path3.join(paths.profileDir, "cordis.patch.yml"), profilePatchBody(paths.workspace, mcp));
}
async function writeEnvFile(paths, apiKey) {
  if (!apiKey) return;
  await fsp4.writeFile(path3.join(paths.home, ENV_FILE), `${API_KEY_ENV}=${apiKey}
`);
}
async function writeInheritedCredentials(paths) {
  const source = path3.join(workHome(), CREDENTIALS_FILE);
  const text = await fsp4.readFile(source, "utf8").catch(() => void 0);
  if (!text) return "skipped";
  const filtered = stripCredentialRecord(text, BROWSER_SESSION_RECORD);
  if (filtered.includes(BROWSER_SESSION_RECORD)) return "skipped";
  if (!filtered.includes("records:") || !filtered.includes(PLATFORM_ACCOUNT_PREFIX)) return "skipped";
  await fsp4.writeFile(path3.join(paths.home, CREDENTIALS_FILE), filtered);
  return "inherited";
}
function stripCredentialRecord(text, key) {
  const out = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    const entry = /^ {2}(\S.*):\s*$/.exec(line);
    if (entry) {
      skipping = entry[1] === key;
      if (skipping) continue;
    } else if (/^\S/.test(line)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}
async function writeCredentialEnv(paths) {
  const envFile = path3.join(paths.home, ENV_FILE);
  const exists = await fsp4.access(envFile).then(() => true).catch(() => false);
  if (exists) return;
  const text = await fsp4.readFile(path3.join(paths.home, CREDENTIALS_FILE), "utf8").catch(() => void 0);
  if (!text) return;
  const key = /DEEPSEEK_API_KEY:\s*["']?([^"'\s]+)["']?/.exec(text)?.[1];
  if (!key) return;
  await fsp4.writeFile(envFile, `${API_KEY_ENV}=${key}
`);
}
async function ensureModuleResolution(paths) {
  const target = path3.join(paths.home, "profiles", PROFILE_NODE_MODULES);
  const shared = path3.join(workHome(), "profiles", PROFILE_NODE_MODULES);
  const available = await fsp4.access(shared).then(() => true).catch(() => false);
  if (!available) return;
  const existing = await fsp4.lstat(target).catch(() => void 0);
  if (existing?.isSymbolicLink()) await fsp4.unlink(target).catch(() => void 0);
  await fsp4.mkdir(target, { recursive: true });
  const link = async (from, to) => {
    const exists = await fsp4.access(to).then(() => true).catch(() => false);
    if (exists) return;
    await fsp4.symlink(from, to, "junction").catch(() => void 0);
  };
  const entries = await fsp4.readdir(shared, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const from = path3.join(shared, entry.name);
    const to = path3.join(target, entry.name);
    if (!entry.name.startsWith("@")) {
      await link(from, to);
      continue;
    }
    await fsp4.mkdir(to, { recursive: true });
    const inner = await fsp4.readdir(from, { withFileTypes: true }).catch(() => []);
    for (const pkg of inner) {
      await link(path3.join(from, pkg.name), path3.join(to, pkg.name));
    }
  }
}

// src/components/sandbox-manager/lifecycle.ts
function newInstanceId() {
  return `${INSTANCE_ID_PREFIX}${Math.random().toString(16).slice(2, 2 + INSTANCE_ID_LENGTH)}`;
}
function instancePaths(root, id) {
  const dir = insidePath(root, path4.join(root, id));
  const home = path4.join(dir, HOME_DIR);
  return {
    dir,
    home,
    workspace: path4.join(dir, WORKSPACE_DIR),
    profileDir: path4.join(home, PROFILE_DIR, SANDBOX_PROFILE),
    logFile: path4.join(dir, LOG_FILE),
    agentsHome: path4.join(dir, PROFILE_AGENTS_DIR)
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
    const credentials = await writeInheritedCredentials(paths);
    if (credentials === "inherited") await writeCredentialEnv(paths);
    await ensureModuleResolution(paths);
    const booted = await boot(paths, env);
    await fsp5.appendFile(paths.logFile, `[sandbox] credentials: ${credentials}
`).catch((error) => console.error("[sandbox] \u5199 credentials \u89C2\u6D4B\u884C\u5931\u8D25", error));
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
    const log = await fsp5.readFile(paths.logFile, "utf8").catch(() => "");
    await sleep(600);
    await fsp5.rm(paths.dir, { recursive: true, force: true, maxRetries: 4 }).catch(() => void 0);
    if (!log.trim()) throw error;
    throw new SandboxError(`${asMessage(error)}
--- boot.log ---
${log.trim().split("\n").slice(-40).join("\n")}`, "create-failed", true);
  }
}
async function cloneLinks(from, to) {
  let linked = 0;
  const skipped = [];
  const entries = await fsp5.readdir(from, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const src = path4.join(from, entry.name);
    const dst = path4.join(to, entry.name);
    const stat = await fsp5.lstat(src).catch(() => void 0);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      const target = await fsp5.readlink(src).catch(() => void 0);
      if (!target) {
        skipped.push(entry.name);
        continue;
      }
      await fsp5.mkdir(path4.dirname(dst), { recursive: true });
      const exists = await fsp5.lstat(dst).then(() => true).catch(() => false);
      if (exists) continue;
      const built = await fsp5.symlink(target, dst, "junction").then(() => true).catch(() => false);
      if (built) linked += 1;
      else skipped.push(entry.name);
      continue;
    }
    if (stat.isDirectory()) {
      await fsp5.mkdir(dst, { recursive: true });
      const nested = await cloneLinks(src, dst);
      linked += nested.linked;
      skipped.push(...nested.skipped);
    }
  }
  return { linked, skipped };
}
async function cloneSandbox(ctx, input) {
  const source = await requireRecord(ctx, input.from);
  const id = newInstanceId();
  const paths = instancePaths(ctx.root, id);
  const env = sandboxEnv(paths.home, paths.agentsHome);
  const fromProfile = path4.join(source.home, "profiles", source.profile);
  const skillsRoot = path4.join(source.home, "skills");
  const skillNames = [];
  try {
    await writeProfile(paths, source.bundles, source.mcp);
    const sourceEnv = await fsp5.readFile(path4.join(source.home, ENV_FILE), "utf8").catch(() => void 0);
    if (sourceEnv !== void 0) await fsp5.writeFile(path4.join(paths.home, ENV_FILE), sourceEnv);
    await writeInheritedCredentials(paths);
    await writeCredentialEnv(paths);
    const cloned = await cloneLinks(path4.join(fromProfile, "node_modules"), path4.join(paths.profileDir, "node_modules"));
    const linked = cloned.linked;
    await ensureModuleResolution(paths);
    const skills = await fsp5.readdir(skillsRoot, { withFileTypes: true }).catch(() => []);
    await fsp5.mkdir(path4.join(paths.home, "skills"), { recursive: true });
    for (const entry of skills) {
      const from = path4.join(skillsRoot, entry.name);
      const to = path4.join(paths.home, "skills", entry.name);
      const stat = await fsp5.lstat(from).catch(() => void 0);
      if (!stat?.isSymbolicLink()) continue;
      const target = await fsp5.readlink(from).catch(() => void 0);
      if (!target) continue;
      await fsp5.symlink(target, to, "junction").catch(() => void 0);
      skillNames.push(entry.name);
    }
    const booted = await boot(paths, env);
    const record = {
      id,
      name: input.name?.trim() || `${source.name}-control`,
      home: paths.home,
      workspace: paths.workspace,
      logFile: paths.logFile,
      profile: SANDBOX_PROFILE,
      bundles: [...source.bundles],
      port: booted.port,
      token: booted.token,
      pid: booted.child.pid ?? 0,
      createdAt: Date.now(),
      ready: booted.ready,
      ...source.mcp ? { mcp: source.mcp } : {},
      ...source.preset ? { preset: source.preset } : {}
    };
    await ctx.state.update((state) => {
      state.sandboxes.push(record);
    });
    return {
      id,
      name: record.name,
      port: booted.port,
      token: booted.token,
      pid: record.pid,
      ready: booted.ready,
      copied: {
        bundles: record.bundles,
        mcp: (source.mcp ?? []).map((item) => item.serverName),
        preset: source.preset?.source ?? null,
        skills: skillNames,
        linked,
        skipped: cloned.skipped
      }
    };
  } catch (error) {
    const log = await fsp5.readFile(paths.logFile, "utf8").catch(() => "");
    await sleep(600);
    await fsp5.rm(paths.dir, { recursive: true, force: true, maxRetries: 4 }).catch(() => void 0);
    if (!log.trim()) throw error;
    throw new SandboxError(
      `${asMessage(error)}
--- boot.log ---
${log.trim().split("\n").slice(-40).join("\n")}`,
      "clone-failed",
      true
    );
  }
}
async function stopSandbox(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  if (!record.pid) {
    return { stopped: record.id, portClosed: !await portOpen(record.port) };
  }
  killTree(record.pid);
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline && await portOpen(record.port)) await sleep(250);
  const portClosed = !await portOpen(record.port);
  if (!portClosed) {
    throw new SandboxError(
      `\u8FDB\u7A0B\u6CA1\u6709\u7ED3\u675F\uFF1A\u7AEF\u53E3 ${record.port} \u4ECD\u88AB\u5360\u7528\uFF0C\u5DF2\u4FDD\u7559 pid ${record.pid} \u4EE5\u4FBF\u91CD\u8BD5\u3002\u518D stop \u4E00\u6B21\uFF1B\u6216\u7528 taskkill\uFF08Windows\uFF09/PID ${record.pid} /T /F \u624B\u52A8\u7ED3\u675F\uFF1B\u6216\u76F4\u63A5 destroy \u4E22\u5F03\u8FD9\u4E2A\u5B9E\u4F8B\u3002`,
      "stop-incomplete"
    );
  }
  await ctx.state.update((next) => {
    const target = next.sandboxes.find((item) => item.id === record.id);
    if (!target) return;
    target.pid = 0;
    target.ready = false;
  });
  return { stopped: record.id, portClosed };
}
async function startSandbox(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  if (record.pid && (alive(record.pid) || await portOpen(record.port))) {
    throw new SandboxError("\u5B9E\u4F8B\u5DF2\u5728\u8FD0\u884C\uFF1B\u8981\u91CD\u542F\u8BF7\u5148 stop", "already-running");
  }
  const paths = instancePaths(ctx.root, record.id);
  const env = sandboxEnv(paths.home, paths.agentsHome);
  await ensureModuleResolution(paths);
  try {
    const booted = await boot(paths, env);
    const pid = booted.child.pid ?? 0;
    try {
      await ctx.state.update((next) => {
        const target = next.sandboxes.find((item) => item.id === record.id);
        if (!target) return;
        target.pid = pid;
        target.port = booted.port;
        target.token = booted.token;
        target.ready = booted.ready;
      });
    } catch (error) {
      killTree(pid);
      throw error;
    }
    return { started: record.id, port: booted.port, token: booted.token, pid, ready: booted.ready };
  } catch (error) {
    const log = await fsp5.readFile(paths.logFile, "utf8").catch(() => "");
    throw new SandboxError(
      `${asMessage(error)}
--- boot.log ---
${log.trim().split("\n").slice(-40).join("\n")}`,
      "start-failed",
      true
    );
  }
}
async function restartSandbox(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  if (record.pid) await stopSandbox(ctx, input);
  return startSandbox(ctx, input);
}
async function destroySandbox(ctx, input) {
  const state = await ctx.state.read();
  const record = state.sandboxes.find((item) => item.id === input.id || item.name === input.id);
  if (!record) throw new Error(`\u6CA1\u6709\u8FD9\u4E2A\u6C99\u7BB1\uFF1A${input.id}`);
  killTree(record.pid);
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline && await portOpen(record.port)) await sleep(250);
  const trash = insidePath(ctx.root, path4.join(ctx.root, `${TRASH_PREFIX}${path4.basename(record.home)}-${Date.now()}`));
  const instanceDir = path4.dirname(record.home);
  const exists = await fsp5.access(instanceDir).then(() => true).catch(() => false);
  if (exists) {
    await fsp5.rename(instanceDir, trash).catch(() => void 0);
    await fsp5.rm(trash, { recursive: true, force: true, maxRetries: 5 }).catch(() => void 0);
  }
  await ctx.state.update((next) => {
    next.sandboxes = next.sandboxes.filter((item) => item.id !== record.id);
  });
  return { destroyed: record.id, portClosed: !await portOpen(record.port) };
}

// src/components/sandbox-manager/extras.ts
var SKILL_NAME = /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
var SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/;
var FIND_SKILL_DIR_BUDGET = 5e3;
var READ_DEFAULT_BYTES = 64 * 1024;
var READ_MAX_BYTES = 1024 * 1024;
async function readWorkspace(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  const root = record.workspace;
  const relative = (input.path ?? "").trim().replace(/^[\\/]+/, "") || ".";
  const target = insidePath(root, path5.join(root, relative));
  const stat = await fsp6.lstat(target).catch(() => void 0);
  if (!stat) throw new SandboxError(`\u6C99\u7BB1 workspace \u91CC\u6CA1\u6709\u8FD9\u4E2A\u8DEF\u5F84\uFF1A${relative}`, "path-not-found");
  if (stat.isSymbolicLink()) {
    throw new SandboxError(`\u4E0D\u8DDF\u968F\u7B26\u53F7\u94FE\u63A5\uFF1A${relative}`, "symlink-not-allowed");
  }
  if (stat.isDirectory()) {
    const entries = await fsp6.readdir(target, { withFileTypes: true });
    const list = [];
    for (const entry of entries.slice(0, 500)) {
      const full = path5.join(target, entry.name);
      const info = await fsp6.lstat(full).catch(() => void 0);
      list.push({
        name: entry.name,
        kind: entry.isDirectory() ? "dir" : "file",
        size: info?.size ?? 0
      });
    }
    return { path: relative, kind: "dir", entries: list, truncated: entries.length > 500 };
  }
  const limit = Math.max(1, Math.min(READ_MAX_BYTES, input.maxBytes ?? READ_DEFAULT_BYTES));
  const handle = await fsp6.open(target, "r");
  try {
    const buffer = Buffer.alloc(Math.min(limit, stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return {
      path: relative,
      kind: "file",
      text: buffer.subarray(0, bytesRead).toString("utf8"),
      bytes: stat.size,
      truncated: stat.size > bytesRead
    };
  } finally {
    await handle.close().catch(() => void 0);
  }
}
async function readBootLog(ctx, input) {
  return readLog(ctx, { ...input, lines: Math.max(1, Math.min(500, input.lines ?? 120)) });
}
async function findSkill(name, root, depth = 0, budget = { left: FIND_SKILL_DIR_BUDGET }) {
  if (depth > 4 || budget.left <= 0) return void 0;
  budget.left -= 1;
  for (const candidate of [path5.join(root, "skills", name), path5.join(root, name)]) {
    const hit = await fsp6.readFile(path5.join(candidate, "SKILL.md"), "utf8").catch(() => void 0);
    if (hit !== void 0) return candidate;
  }
  const entries = await fsp6.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
    const found = await findSkill(name, path5.join(root, entry.name), depth + 1, budget);
    if (found) return found;
  }
  if (budget.left <= 0) {
    throw new SandboxError(
      `\u5728\u5DE5\u4F5C\u76EE\u5F55\u91CC\u67E5\u627E skill \u65F6\u626B\u4E86 ${FIND_SKILL_DIR_BUDGET} \u4E2A\u76EE\u5F55\u4ECD\u672A\u627E\u5230\uFF0C\u5DF2\u505C\u6B62\uFF08\u5DE5\u4F5C\u533A\u592A\u5927\uFF09`,
      "skill-search-exhausted"
    );
  }
  return void 0;
}
async function resolveSkillSource(name, workspaceDir) {
  const roots = [workspaceDir, process.cwd()].filter((item) => Boolean(item));
  for (const root of roots) {
    const found = await findSkill(name, root);
    if (found) return found;
  }
  throw new SandboxError(
    `\u627E\u4E0D\u5230 skill\u300C${name}\u300D\uFF08\u5728\u5DE5\u4F5C\u76EE\u5F55\u4E0E\u5BBF\u4E3B cwd \u4E0B\u6309 <\u4EFB\u610F>/skills/${name} \u6216 <\u4EFB\u610F>/${name} \u627E SKILL.md \u90FD\u6CA1\u6709\uFF09`,
    "skill-not-found"
  );
}
async function addSkill(ctx, input) {
  const name = (input.name ?? "").trim();
  if (!SKILL_NAME.test(name)) throw new SandboxError(`skill \u540D\u4E0D\u5408\u6CD5\uFF1A${name}`, "invalid-skill-name");
  const record = await requireRecord(ctx, input.id);
  const source = await resolveSkillSource(name, ctx.workspaceDir ? await ctx.workspaceDir() : void 0);
  const skillsRoot = path5.join(record.home, "skills");
  await fsp6.mkdir(skillsRoot, { recursive: true });
  const target = insidePath(skillsRoot, path5.join(skillsRoot, name));
  if (target === skillsRoot || path5.dirname(target) !== skillsRoot) {
    throw new SandboxError(`skill \u540D\u4E0D\u5408\u6CD5\uFF1A${name}`, "invalid-skill-name");
  }
  const existing = await fsp6.lstat(target).catch(() => void 0);
  if (existing) await fsp6.rm(target, { recursive: true, force: true });
  await fsp6.symlink(source, target, "junction");
  return { name, source, requiresRestart: false };
}
async function writePatches(ctx, id, workspace, mcp, presetYaml) {
  const paths = instancePaths(ctx.root, id);
  const webProfile = path5.join(paths.home, PROFILE_DIR, SANDBOX_PROFILE);
  await fsp6.mkdir(webProfile, { recursive: true });
  await fsp6.writeFile(path5.join(webProfile, "cordis.patch.yml"), profilePatchBody(workspace, mcp));
  const runProfile = path5.join(paths.home, PROFILE_DIR, RUN_PROFILE);
  await fsp6.mkdir(runProfile, { recursive: true });
  await fsp6.writeFile(path5.join(runProfile, "cordis.patch.yml"), runProfilePatchBody(workspace, mcp, presetYaml));
}
async function usePreset(ctx, input) {
  const presetId = (input.preset ?? "").trim();
  if (!presetId) throw new SandboxError("preset \u4E0D\u80FD\u4E3A\u7A7A", "missing-preset");
  if (!ctx.resolvePreset) {
    throw new SandboxError("\u8BFB\u4E0D\u5230\u5DE5\u4F5C\u73AF\u5883\u7684 agentPresets \u670D\u52A1", "preset-unavailable");
  }
  const record = await requireRecord(ctx, input.id);
  const yaml = await ctx.resolvePreset(presetId);
  if (!yaml) throw new SandboxError(`\u5DE5\u4F5C\u73AF\u5883\u91CC\u6CA1\u6709\u53EF\u8BFB\u7684 preset\u300C${presetId}\u300D`, "preset-not-found");
  await writePatches(ctx, record.id, record.workspace, record.mcp ?? [], yaml);
  await ctx.state.update((state) => {
    const target = state.sandboxes.find((item) => item.id === record.id);
    if (target) target.preset = { source: presetId, yaml };
  });
  const rows = yaml.split("\n").filter((line) => /^\s*-\s+\S/.test(line)).length;
  return { preset: presetId, rows, requiresRestart: true };
}
async function addMcp(ctx, input) {
  const serverName = (input.serverName ?? "").trim();
  if (!SERVER_NAME.test(serverName)) {
    throw new SandboxError(`serverName \u4E0D\u5408\u6CD5\uFF1A${serverName}\uFF08\u53EA\u5141\u8BB8\u5B57\u6BCD\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u3001\u8FDE\u5B57\u7B26\uFF0C1\u201332 \u4F4D\uFF09`, "invalid-server-name");
  }
  if (typeof input.config !== "object" || input.config === null || Array.isArray(input.config)) {
    throw new SandboxError("config \u5FC5\u987B\u662F\u4E00\u4E2A\u5BF9\u8C61", "invalid-mcp-config");
  }
  const record = await requireRecord(ctx, input.id);
  const config = { ...input.config, serverName };
  const next = [
    ...(record.mcp ?? []).filter((entry) => entry.serverName !== serverName),
    { serverName, config }
  ];
  await ctx.state.update((state) => {
    const target = state.sandboxes.find((item) => item.id === record.id);
    if (target) target.mcp = next;
  });
  await writePatches(ctx, record.id, record.workspace, next, record.preset?.yaml);
  return { servers: next.map((entry) => entry.serverName), requiresRestart: true };
}

// src/components/sandbox-manager/install.ts
import fsp7 from "node:fs/promises";
import path6 from "node:path";
async function resolveSource(pkg, workspaceDir) {
  const short = pkg.split("/").pop() ?? pkg;
  const roots = [workspaceDir, process.cwd()].filter((item) => Boolean(item));
  for (const root of roots) {
    const candidates = [
      path6.join(root, "node_modules", ...pkg.split("/")),
      path6.join(root, short),
      path6.join(root, "packages", short)
    ];
    for (const dir of candidates) {
      const text = await fsp7.readFile(path6.join(dir, "package.json"), "utf8").catch(() => void 0);
      if (!text) continue;
      try {
        if (JSON.parse(text).name === pkg) return dir;
      } catch {
      }
    }
  }
  throw new SandboxError(
    `\u627E\u4E0D\u5230 ${pkg} \u7684\u6E90\u7801\u76EE\u5F55\uFF08\u5728\u5DE5\u4F5C\u76EE\u5F55\u4E0E\u5BBF\u4E3B cwd \u4E0B\u7684 node_modules\u3001\u5305\u540D\u76EE\u5F55\u3001packages/ \u91CC\u90FD\u6CA1\u6709\uFF09`,
    "package-not-found"
  );
}
async function installPackage(ctx, input) {
  const name = (input.package ?? "").trim();
  if (!PACKAGE_NAME.test(name)) throw new SandboxError(`\u5305\u540D\u4E0D\u5408\u6CD5\uFF1A${name}`, "invalid-package-name");
  const record = await requireRecord(ctx, input.id);
  const source = await resolveSource(name, ctx.workspaceDir ? await ctx.workspaceDir() : void 0);
  const profileDir = path6.join(record.home, "profiles", record.profile);
  const link = insidePath(profileDir, path6.join(profileDir, PROFILE_NODE_MODULES, ...name.split("/")));
  await fsp7.mkdir(path6.dirname(link), { recursive: true });
  await fsp7.rm(link, { recursive: true, force: true });
  await fsp7.symlink(source, link, "junction");
  const packageFile = path6.join(profileDir, "package.json");
  const manifest = JSON.parse(await fsp7.readFile(packageFile, "utf8"));
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  if (!bundles.includes(name)) bundles.push(name);
  manifest.dsh = { ...manifest.dsh ?? {}, profile: { ...manifest.dsh?.profile ?? {}, bundles } };
  await fsp7.writeFile(packageFile, `${JSON.stringify(manifest, null, 2)}
`);
  await ctx.state.update((state) => {
    const target = state.sandboxes.find((item) => item.id === record.id);
    if (target) target.bundles = bundles;
  });
  if (input.restart === false) {
    return { package: name, source, bundles, requiresReload: true };
  }
  if (!record.pid) {
    return { package: name, source, bundles, requiresReload: false };
  }
  const restarted = await restartSandbox(ctx, { id: record.id });
  return { package: name, source, bundles, requiresReload: false, port: restarted.port };
}

// src/components/sandbox-manager/prompt.ts
import path8 from "node:path";

// src/components/sandbox-manager/runProfile.ts
import fsp8 from "node:fs/promises";
import path7 from "node:path";
async function ensureRunProfile(paths, bundles, mcp, presetYaml) {
  const dir = path7.join(paths.home, "profiles", RUN_PROFILE);
  await fsp8.mkdir(dir, { recursive: true });
  const plugins = bundles.filter((item) => item !== WEB_APP_BUNDLE);
  const list = [.../* @__PURE__ */ new Set(["@deepseek-ai/dsh-base", HEADLESS_BUNDLE, ...plugins])];
  await fsp8.writeFile(
    path7.join(dir, "package.json"),
    `${JSON.stringify({ name: `dsh-profile-${RUN_PROFILE}`, private: true, dsh: { profile: { bundles: list } } }, null, 2)}
`
  );
  await fsp8.writeFile(path7.join(dir, "cordis.patch.yml"), runProfilePatchBody(paths.workspace, mcp, presetYaml));
  const link = path7.join(dir, "node_modules");
  const shared = path7.join(paths.home, "profiles", SANDBOX_PROFILE, "node_modules");
  const linked = await fsp8.access(link).then(() => true).catch(() => false);
  const available = await fsp8.access(shared).then(() => true).catch(() => false);
  if (!linked && available) await fsp8.symlink(shared, link, "junction").catch(() => void 0);
}

// src/components/sandbox-manager/prompt.ts
async function promptSandbox(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  const text = input.text.trim();
  if (!text) throw new SandboxError("\u6D88\u606F\u5185\u5BB9\u4E3A\u7A7A", "empty-prompt");
  const paths = instancePaths(ctx.root, record.id);
  await ensureRunProfile(paths, record.bundles, record.mcp, record.preset?.yaml);
  await writeCredentialEnv(paths);
  const session = input.session?.trim();
  const args = ["--profile", RUN_PROFILE];
  if (session) args.push("--session-id", session);
  args.push(text);
  const result = await runCommand(
    args,
    { cwd: record.workspace, env: sandboxEnv(record.home, paths.agentsHome), stdio: ["ignore", "pipe", "pipe"] },
    input.timeoutMs ?? 18e4
  );
  const assistant = result.out.trim();
  const latest = newestSessionFile(record.home);
  const events = latest ? (await readSession(latest, 400)).events : [];
  const tools = [...new Set(events.filter((event) => event.type.startsWith("tool/")).map((event) => event.type))];
  if (result.code !== 0 && !assistant) {
    const detail = (result.err || "").trim().split("\n").slice(-3).join(" | ");
    throw new SandboxError(`\u6C99\u7BB1\u5BF9\u8BDD\u5931\u8D25\uFF1A${detail || "\u6CA1\u6709\u8F93\u51FA"}`, "prompt-failed");
  }
  return {
    session: latest ? path8.basename(path8.dirname(latest)) : "",
    assistant,
    tools,
    reason: result.code === 0 ? "idle" : "timeout",
    events: events.length
  };
}

// src/components/sandbox-manager/compare.ts
function pairCalls(events) {
  const calls = [];
  let pending;
  for (const event of events) {
    if (event.type === "tool/call") {
      const name = event.text.slice(0, event.text.indexOf("(") < 0 ? 32 : event.text.indexOf("("));
      pending = { name, call: event.text };
      continue;
    }
    if (event.type === "tool/result" && pending) {
      calls.push({ ...pending, result: event.text });
      pending = void 0;
    }
  }
  if (pending) calls.push({ ...pending, result: "" });
  return calls;
}
async function compareSandboxes(ctx, input) {
  const text = input.text.trim();
  const run = async (id, session) => {
    try {
      const result = await promptSandbox(ctx, {
        id,
        text,
        ...session ? { session } : {},
        ...input.timeoutMs === void 0 ? {} : { timeoutMs: input.timeoutMs }
      });
      let calls = [];
      try {
        const page = await readTail(ctx, { id, session: result.session, limit: 120 });
        calls = pairCalls(page.events);
      } catch {
        calls = [];
      }
      return {
        id,
        ok: true,
        assistant: result.assistant,
        session: result.session,
        tools: result.tools,
        calls,
        events: result.events
      };
    } catch (error) {
      return {
        id,
        ok: false,
        assistant: "",
        session: "",
        tools: [],
        calls: [],
        events: 0,
        error: asMessage(error)
      };
    }
  };
  const [a, b] = await Promise.all([run(input.a, input.sessionA), run(input.b, input.sessionB)]);
  return {
    text,
    a,
    b,
    identical: a.ok && b.ok && a.assistant === b.assistant
  };
}

// src/components/sandbox-manager/status.ts
import fsp9 from "node:fs/promises";
import path9 from "node:path";
var ERROR_LINE = /error|failed|cannot resolve|EADDRINUSE/i;
async function clientEntries(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2e3);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/plugins/events`, { signal: controller.signal });
    const reader = response.body?.getReader();
    if (!reader) return [];
    let text = "";
    while (!text.includes('"entries"')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
      if (text.length > 1e6) break;
    }
    await reader.cancel().catch(() => void 0);
    const match = /data: (\{.*\})/.exec(text);
    const raw = match?.[1];
    if (!raw) return [];
    const graph = JSON.parse(raw);
    return (graph.graph?.entries ?? []).map((entry) => entry.id ?? "").filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
async function readStatus(ctx, id) {
  const record = await requireRecord(ctx, id);
  const up = alive(record.pid);
  const listening = up ? await portOpen(record.port) : false;
  let log = "";
  try {
    log = await fsp9.readFile(record.logFile, "utf8");
  } catch {
    log = "";
  }
  const patch = await fsp9.readFile(path9.join(record.home, "profiles", record.profile, "cordis.patch.yml"), "utf8").catch(() => "");
  const policy = /mode:\s*(\S+)/.exec(patch)?.[1] ?? "unknown";
  const errors = log.split("\n").filter((line) => ERROR_LINE.test(line)).slice(-5).map((line) => line.trim().slice(0, 240));
  return {
    id: record.id,
    alive: up,
    listening,
    port: record.port,
    pid: record.pid,
    bundles: record.bundles,
    sessions: listSessionFiles(record.home).length,
    policy,
    clientEntries: listening ? await clientEntries(record.port) : [],
    errors
  };
}

// src/components/sandbox-manager/reconfigure.ts
import path10 from "node:path";
async function reconfigureSandbox(ctx, input) {
  const record = await requireRecord(ctx, input.id);
  const profileDir = path10.join(record.home, "profiles", record.profile);
  const packageFile = path10.join(profileDir, "package.json");
  const bundles = input.bundles && input.bundles.length ? resolveBundles(input.bundles) : record.bundles;
  await import("node:fs/promises").then((fsp10) => fsp10.writeFile(packageFile, profilePackageJson(bundles)));
  const check = await runCommand([...DUMP_CONFIG_ARGS], {
    cwd: record.workspace,
    env: sandboxEnv(record.home, path10.join(path10.dirname(record.home), "agents")),
    stdio: ["ignore", "pipe", "pipe"]
  }, COMMAND_TIMEOUT_MS);
  if (check.code !== 0) {
    await import("node:fs/promises").then((fsp10) => fsp10.writeFile(packageFile, profilePackageJson(record.bundles)));
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
import path11 from "node:path";
function createManager(root = resolveRoot(), workspaceDir, resolvePreset) {
  const ctx = {
    root,
    state: new StateStore(path11.join(root, STATE_FILE)),
    workspaceDir,
    resolvePreset
  };
  return {
    root,
    create: (input) => createSandbox(ctx, input),
    clone: (input) => cloneSandbox(ctx, input),
    compare: (input) => compareSandboxes(ctx, input),
    list: () => listSandboxes(ctx),
    install: (input) => installPackage(ctx, input),
    addSkill: (input) => addSkill(ctx, input),
    addMcp: (input) => addMcp(ctx, input),
    usePreset: (input) => usePreset(ctx, input),
    read: (input) => readWorkspace(ctx, input),
    bootLog: (input) => readBootLog(ctx, input),
    prompt: (input) => promptSandbox(ctx, input),
    status: (id) => readStatus(ctx, id),
    stop: (input) => stopSandbox(ctx, input),
    start: (input) => startSandbox(ctx, input),
    restart: (input) => restartSandbox(ctx, input),
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
  if (route === "read" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("\u7F3A\u5C11 id", "missing-id");
    const maxBytes = Number(query.get("maxBytes"));
    return manager.read({
      id,
      ...query.get("path") ? { path: String(query.get("path")) } : {},
      ...Number.isFinite(maxBytes) && maxBytes > 0 ? { maxBytes } : {}
    });
  }
  if (route === "boot-log" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("\u7F3A\u5C11 id", "missing-id");
    return manager.bootLog({ id, lines: Number(query.get("lines") ?? 120) });
  }
  if (route === "tail" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("\u7F3A\u5C11 id", "missing-id");
    return manager.tail({
      id,
      limit: Number(query.get("limit") ?? 24),
      ...query.get("session") ? { session: String(query.get("session")) } : {}
    });
  }
  if (route === "status" && method === "GET") {
    const id = query.get("id");
    if (!id) throw new SandboxError("\u7F3A\u5C11 id", "missing-id");
    return manager.status(id);
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
  if (route === "install" && method === "POST") {
    const payload = await body();
    return manager.install({
      id: asId(payload),
      package: String(payload.package ?? ""),
      ...payload.restart === false ? { restart: false } : {}
    });
  }
  if (route === "skill" && method === "POST") {
    const payload = await body();
    return manager.addSkill({ id: asId(payload), name: String(payload.name ?? "") });
  }
  if (route === "mcp" && method === "POST") {
    const payload = await body();
    return manager.addMcp({
      id: asId(payload),
      serverName: String(payload.serverName ?? ""),
      config: typeof payload.config === "object" && payload.config ? payload.config : {}
    });
  }
  if (route === "preset" && method === "POST") {
    const payload = await body();
    return manager.usePreset({ id: asId(payload), preset: String(payload.preset ?? "") });
  }
  if (route === "clone" && method === "POST") {
    const payload = await body();
    return manager.clone({
      from: typeof payload.from === "string" ? payload.from : asId(payload),
      ...typeof payload.name === "string" ? { name: payload.name } : {}
    });
  }
  if (route === "compare" && method === "POST") {
    const payload = await body();
    const a = typeof payload.a === "string" ? payload.a.trim() : "";
    const b = typeof payload.b === "string" ? payload.b.trim() : "";
    if (!a || !b) throw new SandboxError("compare \u9700\u8981 a \u4E0E b \u4E24\u4E2A\u5B9E\u4F8B id", "missing-id");
    const text = String(payload.text ?? "").trim();
    if (!text) throw new SandboxError("compare \u9700\u8981\u975E\u7A7A text\uFF0C\u7A7A\u6D88\u606F\u4F1A\u767D\u70E7\u4E24\u6B21\u6A21\u578B\u8C03\u7528", "empty-prompt");
    return manager.compare({
      a,
      b,
      text,
      ...typeof payload.sessionA === "string" ? { sessionA: payload.sessionA } : {},
      ...typeof payload.sessionB === "string" ? { sessionB: payload.sessionB } : {},
      ...typeof payload.timeoutMs === "number" ? { timeoutMs: payload.timeoutMs } : {}
    });
  }
  if (route === "stop" && method === "POST") {
    return manager.stop({ id: asId(await body()) });
  }
  if (route === "start" && method === "POST") {
    return manager.start({ id: asId(await body()) });
  }
  if (route === "restart" && method === "POST") {
    return manager.restart({ id: asId(await body()) });
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

// src/components/sandbox-manager/tools.ts
var TEXT_OUTPUT = {
  schema: { type: "object" },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
};
function registerSandboxTools(tools, manager) {
  tools.register({
    name: "sandbox_create",
    description: "Create an isolated DSH sandbox: its own home, profile, port and sessions, with the work profile untouched. Use it to try a plugin before installing it into the real profile.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name; defaults to the generated id." },
        bundles: { type: "array", items: { type: "string" }, description: "Extra bundles to load on boot." }
      },
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    timeoutMs: 12e4,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.create(args)
  });
  tools.register({
    name: "sandbox_install",
    description: "Install a workspace plugin into a sandbox by linking its source directory into that sandbox's own profile. The package is looked up in the current session's working directory (then the host cwd): `node_modules/<name>`, `<name>/`, or `packages/<name>/`. The instance restarts automatically afterwards, because a profile is composed at process start; pass `restart: false` to install several packages and restart once at the end.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        package: { type: "string", description: "Exact package name, e.g. dsh-dev-sandbox." },
        restart: { type: "boolean", description: "Restart the instance after linking. Defaults to true." }
      },
      required: ["id", "package"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    timeoutMs: 24e4,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.install(args)
  });
  tools.register({
    name: "sandbox_prompt",
    description: "Run one real conversation turn inside a sandbox and return the assistant text plus the tool names it called. This is how a dialogue-facing plugin gets verified. The turn runs on the sandbox's inherited model credentials, so each call costs one real request. Omit `session` to start a new conversation; pass the `session` value returned by the previous call to continue that same conversation \u2014 the sandbox model keeps its earlier context, which is how multi-turn behavior gets tested. For the full event stream of the turn \u2014 every tool call with its arguments and result \u2014 call sandbox_tail next.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        text: { type: "string", description: "Message to send." },
        session: { type: "string", description: "Existing session id to continue. Omit for a new conversation." },
        timeoutMs: { type: "number", description: "How long to wait for the turn to settle." }
      },
      required: ["id", "text"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    timeoutMs: 3e5,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.prompt(args)
  });
  tools.register({
    name: "sandbox_status",
    description: "Report one sandbox: process, port, session count, loaded bundles, the client bundle ids in its boot graph, and the error lines from its startup log. The session count is only a number \u2014 use sandbox_tail to read the conversations themselves.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args) => manager.status(args.id)
  });
  tools.register({
    name: "sandbox_tail",
    description: "Read the most recent events from a sandbox's own session log: user messages, assistant replies, and each tool call paired with its result (arguments included). Use it after sandbox_prompt to see exactly which tools ran and with what arguments, or to read what a human did inside the sandbox's own page. Read-only, and it reads the session file directly, so the sandbox does not need to be running. Returns the newest session's trailing events plus the total event count of that file.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        limit: { type: "number", description: "How many trailing events to return. Defaults to 24, max 200." }
      },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args) => manager.tail(args)
  });
  tools.register({
    name: "sandbox_add_skill",
    description: "Link a local skill directory into a sandbox: the skill is looked up as `skills/<name>/SKILL.md` or `<name>/SKILL.md` under the current session's working directory (then the host cwd), and linked into the sandbox's own skill root so only that instance sees it. Both the web profile and the headless run profile read the same home, so sandbox_prompt sees it too. No restart needed \u2014 skills are read from disk.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        name: { type: "string", description: "Skill directory name." }
      },
      required: ["id", "name"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.addSkill(args)
  });
  tools.register({
    name: "sandbox_add_mcp",
    description: "Configure an MCP server for a sandbox. `config` is passed through to one @deepseek-ai/dsh-mcp-client row in the sandbox's profile patch: either `{ transport: 'stdio', command, args?, env?, cwd? }` or `{ transport: 'streamable-http', url, headers? }`; `serverName` is added for you. The row lands in both the web profile and the headless run profile. Call sandbox_restart afterwards \u2014 profiles are composed at process start.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        serverName: { type: "string", description: "Namespace for this server, 1-32 chars of [A-Za-z0-9_-]." },
        config: { type: "object", description: "dsh-mcp-client config object; serverName is injected." }
      },
      required: ["id", "serverName", "config"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.addMcp(args)
  });
  tools.register({
    name: "sandbox_use_preset",
    description: "Copy an agent preset's plugins from the current environment into a sandbox, so the sandbox agent can see contributions that would otherwise only exist inside that preset. Needed because the headless runner does not compose agent presets at all: skills, tools and other providers registered inside a preset never reach the sandbox agent's scope chain, and sandbox_prompt sees only the global layer. After materializing, those plugins load at profile level (global) instead of preset level. That is enough to verify whether a contribution reaches the agent; it does not reproduce preset scope semantics. The rows go into the headless run profile only \u2014 the sandbox's own web page does not load them. Call sandbox_restart afterwards, then use sandbox_prompt.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        preset: { type: "string", description: "Preset id in the current environment, e.g. the one this session uses." }
      },
      required: ["id", "preset"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.usePreset(args)
  });
  tools.register({
    name: "sandbox_clone",
    description: "Clone a sandbox into a fresh instance with the same configuration \u2014 bundles, MCP servers, materialized preset rows, skill links and plugin links \u2014 but a new home, so it has no sessions or history. Use it to build a control group: clone first, then install the plugin under test into only one side, and sandbox_compare the two. The copy differs only in what you change afterwards.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Sandbox instance id to clone." },
        name: { type: "string", description: "Name for the clone; defaults to `<source>-control`." }
      },
      required: ["from"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    timeoutMs: 18e4,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.clone(args)
  });
  tools.register({
    name: "sandbox_compare",
    description: "Send the same message to two sandboxes in parallel and return both answers side by side, plus whether the assistant text is identical. The two runs are independent processes with their own home and port, so they really do run concurrently. Each side costs one real model request. Pass sessionA / sessionB to continue earlier conversations in each sandbox.",
    parameters: {
      type: "object",
      properties: {
        a: { type: "string", description: "First sandbox instance id." },
        b: { type: "string", description: "Second sandbox instance id." },
        text: { type: "string", description: "Message to send to both." },
        sessionA: { type: "string", description: "Session id to continue on side a." },
        sessionB: { type: "string", description: "Session id to continue on side b." },
        timeoutMs: { type: "number", description: "Per-side timeout for the turn to settle." }
      },
      required: ["a", "b", "text"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    timeoutMs: 6e5,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.compare(args)
  });
  tools.register({
    name: "sandbox_read",
    description: "Read a file or list a directory inside a sandbox's workspace. This is how you check what a plugin actually produced \u2014 generated configs, caches, logs. Path is relative to the sandbox workspace and cannot escape it. Omit `path` to list the workspace root. Text is capped at 64 KiB by default (`maxBytes` up to 1 MiB); `truncated` tells you whether the file is longer.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        path: { type: "string", description: "Path relative to the sandbox workspace." },
        maxBytes: { type: "number", description: "Byte budget when reading a file. Default 65536, max 1048576." }
      },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args) => manager.read(args)
  });
  tools.register({
    name: "sandbox_log",
    description: "Read the tail of a sandbox's boot.log. sandbox_status only returns the error lines; when a plugin fails to load you usually need the surrounding context \u2014 which bundle failed, what the resolver said. Read-only.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        lines: { type: "number", description: "How many trailing lines. Default 120, max 500." }
      },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args) => manager.bootLog(args)
  });
  tools.register({
    name: "sandbox_stop",
    description: "Stop a sandbox's process and release its port while keeping its home directory, profile and sessions, so it can be started again later. Use this instead of sandbox_destroy when the data should survive.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.stop(args)
  });
  tools.register({
    name: "sandbox_start",
    description: "Start a previously stopped sandbox again from its existing home and profile. The port may change; the result carries the new port and token.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    timeoutMs: 18e4,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.start(args)
  });
  tools.register({
    name: "sandbox_restart",
    description: "Restart a sandbox: stop its process, then start it again from the same home. Required after sandbox_install \u2014 a profile is composed at process start, so a newly linked plugin does not appear until the instance restarts. The port may change.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    timeoutMs: 18e4,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.restart(args)
  });
  tools.register({
    name: "sandbox_destroy",
    description: "Destroy a sandbox: kill its process tree, wait for the port to close, delete its home directory.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => manager.destroy(args)
  });
}

// src/components/sandbox-manager/register.ts
function workspaceResolver(ctx) {
  return async () => {
    try {
      const agents = ctx.get("agents");
      const workingDirectory = ctx.get("workingDirectory");
      const agent = agents?.currentInitiator?.();
      if (workingDirectory?.ensure && agent) return await workingDirectory.ensure(agent);
      return workingDirectory?.defaultDirectory;
    } catch {
      return void 0;
    }
  };
}
function presetResolver(ctx) {
  return async (id) => {
    try {
      const presets = ctx.get("agentPresets");
      if (!presets?.readDocument) return void 0;
      const doc = await presets.readDocument(id);
      const content = doc?.content;
      return typeof content === "string" && content.trim() ? content : void 0;
    } catch {
      return void 0;
    }
  };
}
function registerSandboxManager(ctx) {
  const manager = createManager(void 0, workspaceResolver(ctx), presetResolver(ctx));
  ctx.inject(["tools"], (scope) => {
    const tools = scope.tools;
    if (tools) registerSandboxTools(tools, manager);
  });
  ctx.inject(["webServer"], (scope) => {
    const web = scope.webServer;
    if (!web) return;
    const handler = async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const route = stripRoutePrefix(url.pathname);
      try {
        if (route === STYLESHEET_ROUTE && (req.method ?? "GET") === "GET") {
          const css = await readStylesheet();
          res.writeHead(200, {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "no-cache",
            "content-length": Buffer.byteLength(css)
          });
          res.end(css);
          return;
        }
        const result = await dispatch(manager, req.method ?? "GET", route, url.searchParams, () => readJsonBody(req));
        sendJson(res, 200, { ok: true, ...typeof result === "object" && result ? result : { value: result } });
      } catch (error) {
        const status = error instanceof SandboxError && error.code === "unknown-route" ? 404 : 500;
        sendJson(res, status, { ok: false, error: asMessage(error) });
      }
    };
    const dispose = web.register({ kind: "prefix", path: ROUTE_PREFIX, handler });
    scope.effect?.(() => () => dispose());
  });
}

// src/entries/host.ts
function apply(ctx) {
  registerSandboxManager(ctx);
}
export {
  apply
};
