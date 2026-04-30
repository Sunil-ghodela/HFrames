import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, statSync, rmSync } from "node:fs";
import { renderJob } from "../src/render.ts";
import { loadTemplate, hydrateTemplate } from "../src/template.ts";
import type { JobSpec } from "../src/jobs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOULD_RUN = process.env.SMOKE_RENDER === "1";

describe.skipIf(!SHOULD_RUN)("render smoke test (real MP4 render)", () => {
  it(
    "produces a playable MP4 from shayari-reel minimal fixture",
    { timeout: 180_000 },
    async () => {
      const job: JobSpec = {
        template: "shayari-reel",
        app: "craftlee",
        aspect: "9:16",
        duration: 4, // shorter for smoke test
        output: { name: "smoke-shayari", formats: ["mp4"] },
        vars: {
          shayariLines: ["smoke test line one", "smoke test line two"],
        },
      };

      const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
      const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });

      const outDir = join(ROOT, "out", ".smoke");
      if (existsSync(outDir)) rmSync(outDir, { recursive: true });

      const result = await renderJob({
        job,
        html,
        outDir,
        rootDir: ROOT,
      });

      expect(existsSync(result.outputPath)).toBe(true);
      const size = statSync(result.outputPath).size;
      expect(size).toBeGreaterThan(50_000); // > 50 KB sanity
      expect(result.outputPath.endsWith(".mp4")).toBe(true);
    },
  );
});
