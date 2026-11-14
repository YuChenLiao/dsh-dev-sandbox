import type { SandboxManager } from "./manager.ts";

const TEXT_OUTPUT = {
  schema: { type: "object" as const },
  render: (_args: unknown, value: unknown) => [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
};

export interface ToolsLike {
  register(definition: Record<string, unknown>, options?: Record<string, unknown>): () => void;
}

/**
 * 五个工具：入参只有标识与文本，没有路径、没有命令。
 * 会话工作区、沙箱 policy、凭据位置都由 manager 内部决定，模型无从指定。
 */
export function registerSandboxTools(tools: ToolsLike, manager: SandboxManager): void {
  tools.register({
    name: "sandbox_create",
    description:
      "Create an isolated DSH sandbox: its own home, profile, port and sessions, with the work profile untouched. "
      + "Use it to try a plugin before installing it into the real profile.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name; defaults to the generated id." },
        bundles: { type: "array", items: { type: "string" }, description: "Extra bundles to load on boot." },
      },
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.create(args as { name?: string; bundles?: string[] }),
  });

  tools.register({
    name: "sandbox_install",
    description:
      "Install a workspace plugin into a sandbox by linking its source directory into that sandbox's own profile. "
      + "The package is looked up in the current session's working directory (then the host cwd): "
      + "`node_modules/<name>`, `<name>/`, or `packages/<name>/`. "
      + "A running instance does not hot-load it: call sandbox_restart afterwards.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        package: { type: "string", description: "Exact package name, e.g. dsh-dev-sandbox." },
      },
      required: ["id", "package"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.install(args as { id: string; package: string }),
  });

  tools.register({
    name: "sandbox_prompt",
    description:
      "Run one real conversation turn inside a sandbox and return the assistant text plus the tool names it called. "
      + "This is how a dialogue-facing plugin gets verified. The turn runs on the sandbox's inherited model credentials, "
      + "so each call costs one real request. "
      + "Omit `session` to start a new conversation; pass the `session` value returned by the previous call to continue "
      + "that same conversation — the sandbox model keeps its earlier context, which is how multi-turn behavior gets tested. "
      + "For the full event stream of the turn — every tool call with its arguments and result — call sandbox_tail next.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        text: { type: "string", description: "Message to send." },
        session: { type: "string", description: "Existing session id to continue. Omit for a new conversation." },
        timeoutMs: { type: "number", description: "How long to wait for the turn to settle." },
      },
      required: ["id", "text"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    timeoutMs: 300_000,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.prompt(args as { id: string; text: string; timeoutMs?: number; session?: string }),
  });

  tools.register({
    name: "sandbox_status",
    description:
      "Report one sandbox: process, port, session count, loaded bundles, the client bundle ids in its boot graph, "
      + "and the error lines from its startup log. "
      + "The session count is only a number — use sandbox_tail to read the conversations themselves.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args: unknown) => manager.status((args as { id: string }).id),
  });

  tools.register({
    name: "sandbox_tail",
    description:
      "Read the most recent events from a sandbox's own session log: user messages, assistant replies, "
      + "and each tool call paired with its result (arguments included). "
      + "Use it after sandbox_prompt to see exactly which tools ran and with what arguments, "
      + "or to read what a human did inside the sandbox's own page. "
      + "Read-only, and it reads the session file directly, so the sandbox does not need to be running. "
      + "Returns the newest session's trailing events plus the total event count of that file.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        limit: { type: "number", description: "How many trailing events to return. Defaults to 24, max 200." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args: unknown) => manager.tail(args as { id: string; limit?: number }),
  });

  tools.register({
    name: "sandbox_add_skill",
    description:
      "Link a local skill directory into a sandbox: the skill is looked up as `skills/<name>/SKILL.md` "
      + "or `<name>/SKILL.md` under the current session's working directory (then the host cwd), "
      + "and linked into the sandbox's own skill root so only that instance sees it. "
      + "Both the web profile and the headless run profile read the same home, so sandbox_prompt sees it too. "
      + "No restart needed — skills are read from disk.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        name: { type: "string", description: "Skill directory name." },
      },
      required: ["id", "name"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.addSkill(args as { id: string; name: string }),
  });

  tools.register({
    name: "sandbox_add_mcp",
    description:
      "Configure an MCP server for a sandbox. `config` is passed through to one @deepseek-ai/dsh-mcp-client row "
      + "in the sandbox's profile patch: either `{ transport: 'stdio', command, args?, env?, cwd? }` "
      + "or `{ transport: 'streamable-http', url, headers? }`; `serverName` is added for you. "
      + "The row lands in both the web profile and the headless run profile. "
      + "Call sandbox_restart afterwards — profiles are composed at process start.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        serverName: { type: "string", description: "Namespace for this server, 1-32 chars of [A-Za-z0-9_-]." },
        config: { type: "object", description: "dsh-mcp-client config object; serverName is injected." },
      },
      required: ["id", "serverName", "config"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.addMcp(args as { id: string; serverName: string; config: Record<string, unknown> }),
  });

  tools.register({
    name: "sandbox_use_preset",
    description:
      "Copy an agent preset's plugins from the current environment into a sandbox, so the sandbox agent can see "
      + "contributions that would otherwise only exist inside that preset. "
      + "Needed because the headless runner does not compose agent presets at all: skills, tools and other providers "
      + "registered inside a preset never reach the sandbox agent's scope chain, and sandbox_prompt sees only the global layer. "
      + "After materializing, those plugins load at profile level (global) instead of preset level. "
      + "That is enough to verify whether a contribution reaches the agent; it does not reproduce preset scope semantics. "
      + "The rows go into the headless run profile only — the sandbox's own web page does not load them. "
      + "Call sandbox_restart afterwards, then use sandbox_prompt.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        preset: { type: "string", description: "Preset id in the current environment, e.g. the one this session uses." },
      },
      required: ["id", "preset"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.usePreset(args as { id: string; preset: string }),
  });

  tools.register({
    name: "sandbox_clone",
    description:
      "Clone a sandbox into a fresh instance with the same configuration — bundles, MCP servers, materialized preset rows, "
      + "skill links and plugin links — but a new home, so it has no sessions or history. "
      + "Use it to build a control group: clone first, then install the plugin under test into only one side, "
      + "and sandbox_compare the two. The copy differs only in what you change afterwards.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Sandbox instance id to clone." },
        name: { type: "string", description: "Name for the clone; defaults to `<source>-control`." },
      },
      required: ["from"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.clone(args as { from: string; name?: string }),
  });

  tools.register({
    name: "sandbox_compare",
    description:
      "Send the same message to two sandboxes in parallel and return both answers side by side, plus whether the "
      + "assistant text is identical. The two runs are independent processes with their own home and port, so they "
      + "really do run concurrently. Each side costs one real model request. "
      + "Pass sessionA / sessionB to continue earlier conversations in each sandbox.",
    parameters: {
      type: "object",
      properties: {
        a: { type: "string", description: "First sandbox instance id." },
        b: { type: "string", description: "Second sandbox instance id." },
        text: { type: "string", description: "Message to send to both." },
        sessionA: { type: "string", description: "Session id to continue on side a." },
        sessionB: { type: "string", description: "Session id to continue on side b." },
        timeoutMs: { type: "number", description: "Per-side timeout for the turn to settle." },
      },
      required: ["a", "b", "text"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    timeoutMs: 600_000,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.compare(args as {
      a: string; b: string; text: string; sessionA?: string; sessionB?: string; timeoutMs?: number;
    }),
  });

  tools.register({
    name: "sandbox_stop",
    description:
      "Stop a sandbox's process and release its port while keeping its home directory, profile and sessions, "
      + "so it can be started again later. Use this instead of sandbox_destroy when the data should survive.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.stop(args as { id: string }),
  });

  tools.register({
    name: "sandbox_start",
    description:
      "Start a previously stopped sandbox again from its existing home and profile. The port may change; "
      + "the result carries the new port and token.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.start(args as { id: string }),
  });

  tools.register({
    name: "sandbox_restart",
    description:
      "Restart a sandbox: stop its process, then start it again from the same home. "
      + "Required after sandbox_install — a profile is composed at process start, so a newly linked plugin "
      + "does not appear until the instance restarts. The port may change.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.restart(args as { id: string }),
  });

  tools.register({
    name: "sandbox_destroy",
    description: "Destroy a sandbox: kill its process tree, wait for the port to close, delete its home directory.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Sandbox instance id." } },
      required: ["id"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.destroy(args as { id: string }),
  });
}
