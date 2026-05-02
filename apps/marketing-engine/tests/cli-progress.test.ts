import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "src/cli.ts");

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", [CLI, ...args], { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

function writeSpec(extra: Record<string, unknown> = {}): string {
  const tmp = mkdtempSync(join(tmpdir(), "reel-spec-"));
  const specPath = join(tmp, "job.json");
  writeFileSync(
    specPath,
    JSON.stringify({
      template: "shayari-reel",
      app: "craftlee",
      aspect: "9:16",
      duration: 3,
      output: { name: "json-progress-test", formats: ["mp4"] },
      vars: { shayariLines: ["line one", "line two"] },
      ...extra,
    }),
  );
  return specPath;
}

describe("cli --json-progress", () => {
  it("emits JSONL events on stdout for shayari-reel minimal fixture", async () => {
    const specPath = writeSpec();
    const { stdout, code } = await runCli(["make", specPath, "--json-progress"]);

    expect(code).toBe(0);

    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);

    const events = lines.map((l) => JSON.parse(l));
    const types = events.map((e) => e.type);
    expect(types).toContain("started");
    expect(types[types.length - 1]).toBe("done");

    const done = events[events.length - 1];
    expect(done.data.outputPath).toMatch(/\.mp4$/);
    expect(typeof done.data.durationMs).toBe("number");

    expect(stdout).not.toMatch(/\[Compiler\]|\[INFO\]|\[WARN\]/);
  }, 180_000);

  it("without --json-progress, stdout has human logs (legacy behavior)", async () => {
    const specPath = writeSpec({ output: { name: "legacy-test", formats: ["mp4"] } });
    const { stdout, code } = await runCli(["make", specPath]);
    expect(code).toBe(0);
    let allJson = true;
    for (const line of stdout.split("\n").filter((l) => l.trim())) {
      try {
        JSON.parse(line);
      } catch {
        allJson = false;
        break;
      }
    }
    expect(allJson).toBe(false);
  }, 180_000);
});
