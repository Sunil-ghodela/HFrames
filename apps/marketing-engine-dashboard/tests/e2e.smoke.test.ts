import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import { createApp } from "../src/server/routes.ts";

const RUN = process.env.SMOKE_RENDER === "1";

describe.skipIf(!RUN)("e2e smoke (real renderJob)", () => {
  it("renders shayari-reel from a posted job to a real MP4", { timeout: 180_000 }, async () => {
    const app = createApp();

    const startRes = await app.fetch(
      new Request("http://localhost/api/renders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "shayari-reel",
          app: "craftlee",
          aspect: "9:16",
          duration: 4,
          vars: { shayariLines: ["smoke test line one", "smoke test line two"] },
          output: { name: "dashboard-smoke", formats: ["mp4"] },
        }),
      }),
    );
    expect(startRes.status).toBe(200);
    const { jobId } = (await startRes.json()) as { jobId: string };
    expect(jobId).toBeTruthy();

    const eventsRes = await app.fetch(new Request(`http://localhost/api/renders/${jobId}/events`));
    const reader = eventsRes.body!.getReader();
    const decoder = new TextDecoder();
    let outputFile: string | undefined;
    let errorMessage: string | undefined;
    let buffer = "";
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline && !outputFile && !errorMessage) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split("\n\n")) {
        if (!line.startsWith("data: ")) continue;
        let ev: { type: string; data?: { outputFile?: string; message?: string } };
        try {
          ev = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (ev.type === "done") outputFile = ev.data?.outputFile;
        else if (ev.type === "error") errorMessage = ev.data?.message ?? "unknown";
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
    }

    if (errorMessage) throw new Error(`render failed: ${errorMessage}`);
    expect(outputFile).toBeDefined();

    const s = await stat(outputFile!);
    expect(s.size).toBeGreaterThan(10_000);
  });
});
