#!/usr/bin/env tsx
import { defineCommand, runMain } from "citty";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseJobSpec, type JobSpec } from "./jobs.ts";
import { loadTemplate, hydrateTemplate } from "./template.ts";
import { renderJob } from "./render.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const makeCmd = defineCommand({
  meta: { name: "make", description: "Render a single composition from a template or spec file" },
  args: {
    kind: { type: "string", description: "Template name (e.g. shayari-reel)" },
    app: { type: "string", description: "App brand kit (craftlee | reelvoice)" },
    aspect: { type: "string", description: "Aspect ratio (9:16 | 1:1 | 16:9)" },
    duration: { type: "string", description: "Override duration in seconds" },
    name: { type: "string", description: "Output base name (default: <kind>-<timestamp>)" },
    var: {
      type: "string",
      description: "Slot var, repeatable: --var key=value or --var key=<JSON>",
      multiple: true,
    },
    spec: { type: "string", description: "Path to a JobSpec JSON file (overrides other flags)" },
  },
  async run({ args }) {
    let job: JobSpec;
    if (args.spec) {
      const fs = await import("node:fs/promises");
      const raw = JSON.parse(await fs.readFile(args.spec, "utf8"));
      job = parseJobSpec(raw);
    } else {
      job = buildJobFromFlags(args);
    }

    const tpl = await loadTemplate(job.template, { rootDir: ROOT });
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });

    const outDir = join(ROOT, "out");
    const result = await renderJob({ job, html, outDir, rootDir: ROOT });

    console.log(`✓ rendered in ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log(result.outputPath);
  },
});

function buildJobFromFlags(args: Record<string, unknown>): JobSpec {
  const kind = required(args.kind, "--kind");
  const app = required(args.app, "--app");
  const aspect = required(args.aspect, "--aspect");
  const vars: Record<string, unknown> = {};
  const rawVar = args.var as string | string[] | undefined;
  const rawVars: string[] = rawVar === undefined ? [] : Array.isArray(rawVar) ? rawVar : [rawVar];
  for (const v of rawVars) {
    const eq = v.indexOf("=");
    if (eq < 0) throw new Error(`--var must be key=value, got: ${v}`);
    const key = v.slice(0, eq);
    const val = v.slice(eq + 1);
    vars[key] = parseValue(val);
  }
  const name = (args.name as string | undefined) ?? `${kind}-${Date.now()}`;
  const duration = args.duration ? Number(args.duration) : undefined;
  return parseJobSpec({
    template: kind,
    app,
    aspect,
    duration,
    output: { name, formats: ["mp4"] },
    vars,
  });
}

function required(v: unknown, flag: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${flag} is required`);
  }
  return v;
}

function parseValue(raw: string): unknown {
  // Accept JSON for arrays/objects/numbers/bools, fall back to string
  if (
    (raw.startsWith("[") && raw.endsWith("]")) ||
    (raw.startsWith("{") && raw.endsWith("}")) ||
    raw === "true" ||
    raw === "false" ||
    /^-?\d+(\.\d+)?$/.test(raw)
  ) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through
    }
  }
  return raw;
}

const main = defineCommand({
  meta: { name: "marketing-engine", description: "Local marketing-content factory" },
  subCommands: { make: makeCmd },
});

void runMain(main);
