import { describe, it, expect } from "vitest";
import { createRenderRunner } from "../../src/server/render-runner.ts";

describe("RenderRunner", () => {
  it("rejects a second start while busy with 409 semantics", async () => {
    const runner = createRenderRunner({
      runRender: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { outputPath: "/tmp/out.mp4", jobId: "x", durationMs: 50 };
      },
    });

    const req = {
      template: "shayari-reel",
      app: "craftlee",
      aspect: "9:16" as const,
      vars: { shayariLines: ["a", "b"] },
      output: { name: "test", formats: ["mp4"] as ["mp4"] },
    };

    const first = runner.start(req);
    const second = await runner.start(req).catch((e) => e);
    expect(second).toBeInstanceOf(Error);
    expect((second as Error).message).toMatch(/busy/i);

    await first;
  });

  it("emits progress events through subscribe()", async () => {
    const runner = createRenderRunner({
      runRender: async (_req, onProgress) => {
        onProgress?.({ phase: "preprocessing", progress: 0.1 });
        onProgress?.({ phase: "capture", progress: 0.5 });
        onProgress?.({ phase: "encode", progress: 0.9 });
        return { outputPath: "/tmp/out.mp4", jobId: "x", durationMs: 100 };
      },
    });

    const events: string[] = [];

    const req = {
      template: "shayari-reel",
      app: "craftlee",
      aspect: "9:16" as const,
      vars: { shayariLines: ["a", "b"] },
      output: { name: "test", formats: ["mp4"] as ["mp4"] },
    };

    const startPromise = runner.start(req);
    const cleanup = runner.subscribe(runner.currentJobId()!, (ev) => events.push(ev.type));
    await startPromise;
    cleanup();
    expect(events).toContain("done");
  });
});
