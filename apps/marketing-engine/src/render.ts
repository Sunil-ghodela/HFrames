import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRenderJob, executeRenderJob, type RenderConfig } from "@hyperframes/producer";
import type { JobSpec } from "./jobs.ts";

export interface RenderArgs {
  job: JobSpec;
  html: string;
  outDir: string;
  rootDir: string;
}

export interface RenderResult {
  outputPath: string;
  jobId: string;
  durationMs: number;
}

export async function renderJob(args: RenderArgs): Promise<RenderResult> {
  const { job, html, outDir } = args;
  const jobId = `${job.output.name}-${Date.now()}`;
  const projectDir = join(outDir, ".tmp", jobId);
  await mkdir(projectDir, { recursive: true });

  // Write hydrated HTML as the producer's entry file
  const htmlPath = join(projectDir, "index.html");
  await writeFile(htmlPath, html, "utf8");

  // Copy any local assets the template references (Phase A: nothing yet)
  // Future: walk html for src/href to local files under rootDir/assets and copy them here

  const finalDir = ensureDateAppAspectDir(outDir, job);
  const finalPath = join(finalDir, `${job.output.name}.mp4`);

  const config: RenderConfig = {
    fps: 30,
    quality: "standard",
    format: "mp4",
    entryFile: "index.html",
  };

  const start = Date.now();
  const renderJobInstance = createRenderJob(config);
  await executeRenderJob(renderJobInstance, projectDir, finalPath);
  const elapsed = Date.now() - start;

  // Sidecar JSON for reproducibility
  await writeFile(finalPath.replace(/\.mp4$/, ".json"), JSON.stringify(job, null, 2), "utf8");

  return { outputPath: finalPath, jobId, durationMs: elapsed };
}

function ensureDateAppAspectDir(outDir: string, job: JobSpec): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const aspectDir = job.aspect.replace(":", "-");
  const dir = join(outDir, today, job.app, aspectDir);
  mkdirSync(dir, { recursive: true });
  return dir;
}
