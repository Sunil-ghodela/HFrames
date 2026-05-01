import { describe, it, expect } from "vitest";
import { createRenderRunner } from "../../src/server/render-runner.ts";

describe("RenderRunner", () => {
  const REQ = {
    template: "shayari-reel",
    app: "craftlee",
    aspect: "9:16" as const,
    vars: { shayariLines: ["a", "b"] },
    output: { name: "test", formats: ["mp4"] as ["mp4"] },
  };

  it("rejects a second start while busy", async () => {
    const runner = createRenderRunner({
      runRender: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { outputPath: "/tmp/out.mp4", jobId: "x", durationMs: 50 };
      },
    });

    const { jobId } = runner.start(REQ);
    expect(jobId).toBeTruthy();
    expect(runner.isBusy()).toBe(true);

    expect(() => runner.start(REQ)).toThrow(/busy/i);

    // Wait for the first render to complete via subscribe-to-done
    await new Promise<void>((resolve) => {
      const cleanup = runner.subscribe(jobId, (ev) => {
        if (ev.type === "done" || ev.type === "error") {
          cleanup();
          resolve();
        }
      });
    });
    expect(runner.isBusy()).toBe(false);
  });

  it("emits progress and done events through subscribe()", async () => {
    const runner = createRenderRunner({
      runRender: async (_req, onProgress) => {
        onProgress?.({ phase: "preprocessing", progress: 0.1 });
        onProgress?.({ phase: "capture", progress: 0.5 });
        onProgress?.({ phase: "encode", progress: 0.9 });
        return { outputPath: "/tmp/out.mp4", jobId: "x", durationMs: 100 };
      },
    });

    const events: string[] = [];
    const { jobId } = runner.start(REQ);
    // start() schedules the actual render on a microtask, so subscribers
    // attached synchronously after start() will see every event.
    const cleanup = runner.subscribe(jobId, (ev) => events.push(ev.type));

    await new Promise<void>((resolve) => {
      const inner = runner.subscribe(jobId, (ev) => {
        if (ev.type === "done" || ev.type === "error") {
          inner();
          resolve();
        }
      });
    });
    cleanup();

    expect(events.filter((t) => t === "progress").length).toBe(3);
    expect(events).toContain("done");
  });
});
