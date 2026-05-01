import { describe, it, expect, vi } from "vitest";
import type { RenderArgs } from "../src/render.ts";

// We don't run a real render here — we just verify the signature accepts onProgress.
// A separate smoke test exercises the real producer.
describe("renderJob onProgress signature", () => {
  it("accepts an onProgress option in its args", () => {
    const onProgress = vi.fn();
    const args: RenderArgs = {
      job: {
        template: "shayari-reel",
        app: "craftlee",
        aspect: "9:16",
        output: { name: "x", formats: ["mp4"] },
        vars: {},
      } as never,
      html: "<html></html>",
      outDir: "/tmp/x",
      rootDir: "/tmp/x",
      onProgress,
    };
    expect(typeof args.onProgress).toBe("function");
  });
});
