import { randomUUID } from "node:crypto";
import type { RenderRequest, RenderEvent, RenderProgress } from "../shared/types.ts";

export interface RenderRunResult {
  outputPath: string;
  jobId: string;
  durationMs: number;
}

export interface RenderRunnerDeps {
  runRender: (
    req: RenderRequest,
    onProgress?: (p: RenderProgress) => void,
  ) => Promise<RenderRunResult>;
}

export interface RenderRunner {
  start(req: RenderRequest): { jobId: string };
  subscribe(jobId: string, listener: (ev: RenderEvent) => void): () => void;
  isBusy(): boolean;
  currentJobId(): string | null;
  getResult(jobId: string): RenderRunResult | undefined;
}

export function createRenderRunner(deps: RenderRunnerDeps): RenderRunner {
  let busy = false;
  let currentId: string | null = null;
  const listeners = new Map<string, Set<(ev: RenderEvent) => void>>();
  const results = new Map<string, RenderRunResult>();

  function emit(jobId: string, ev: RenderEvent): void {
    const set = listeners.get(jobId);
    if (!set) return;
    for (const fn of set) fn(ev);
  }

  return {
    start(req) {
      if (busy) throw new Error("render runner is busy");
      busy = true;
      const jobId = randomUUID();
      currentId = jobId;

      // Defer the actual render to a microtask so callers have a chance to
      // subscribe via subscribe(jobId, ...) before any events are emitted.
      queueMicrotask(() => {
        void (async () => {
          try {
            const result = await deps.runRender(req, (p) => {
              emit(jobId, { type: "progress", data: p });
            });
            results.set(jobId, result);
            emit(jobId, {
              type: "done",
              data: { outputFile: result.outputPath, durationMs: result.durationMs },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            emit(jobId, { type: "error", data: { message } });
          } finally {
            busy = false;
            currentId = null;
          }
        })();
      });

      return { jobId };
    },

    subscribe(jobId, listener) {
      const set = listeners.get(jobId) ?? new Set();
      set.add(listener);
      listeners.set(jobId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(jobId);
      };
    },

    isBusy() {
      return busy;
    },

    currentJobId() {
      return currentId;
    },

    getResult(jobId) {
      return results.get(jobId);
    },
  };
}
