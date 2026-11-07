import fsp from "node:fs/promises";
import type { SandboxState } from "./types.ts";

/**
 * 账本读写。所有变更走一条 Promise 链串行执行，
 * 避免两个并发 create 各自 read-modify-write 时丢记录。
 */
export class StateStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  async read(): Promise<SandboxState> {
    try {
      const text = await fsp.readFile(this.file, "utf8");
      const parsed = JSON.parse(text) as Partial<SandboxState>;
      return { sandboxes: Array.isArray(parsed.sandboxes) ? parsed.sandboxes : [] };
    } catch {
      return { sandboxes: [] };
    }
  }

  async update(mutate: (state: SandboxState) => SandboxState | void): Promise<SandboxState> {
    const run = this.tail.then(async () => {
      const state = await this.read();
      const next = mutate(state) ?? state;
      await fsp.mkdir(this.file.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(next, null, 2));
      await fsp.rename(tmp, this.file);
      return next;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}
