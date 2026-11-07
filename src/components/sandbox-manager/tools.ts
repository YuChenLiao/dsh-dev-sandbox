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
      + "The work profile and its node_modules are not touched. A running instance does not hot-load it: "
      + "recreate the instance to load the plugin.",
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
      + "For the full event stream of that turn — every tool call with its arguments and result — call sandbox_tail next.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sandbox instance id." },
        text: { type: "string", description: "Message to send." },
        timeoutMs: { type: "number", description: "How long to wait for the turn to settle." },
      },
      required: ["id", "text"],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    timeoutMs: 300_000,
    isConcurrencySafe: () => false,
    execute: async (args: unknown) => manager.prompt(args as { id: string; text: string; timeoutMs?: number }),
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
