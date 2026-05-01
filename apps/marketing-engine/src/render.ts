import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRenderJob, executeRenderJob, type RenderConfig } from "@hyperframes/producer";
import type { JobSpec } from "./jobs.ts";

export type RenderProgressPhase =
  | "preprocessing"
  | "capture"
  | "encode"
  | "postprocessing"
  | "done";

export interface RenderProgress {
  phase: RenderProgressPhase;
  progress: number; // 0..1
  message?: string;
}

export interface RenderArgs {
  job: JobSpec;
  html: string;
  outDir: string;
  rootDir: string;
  onProgress?: (event: RenderProgress) => void;
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
  await executeRenderJob(renderJobInstance, projectDir, finalPath, (job, _stage) => {
    if (!args.onProgress) return;
    const phase = mapProducerStatusToPhase(job.status);
    if (!phase) return;
    args.onProgress({
      phase,
      progress: typeof job.progress === "number" ? job.progress / 100 : 0,
      message: job.currentStage,
    });
  });
  args.onProgress?.({ phase: "done", progress: 1 });
  const elapsed = Date.now() - start;

  // Sidecar JSON for reproducibility
  await writeFile(finalPath.replace(/\.mp4$/, ".json"), JSON.stringify(job, null, 2), "utf8");

  return { outputPath: finalPath, jobId, durationMs: elapsed };
}

function mapProducerStatusToPhase(status: string): RenderProgressPhase | null {
  switch (status) {
    case "preprocessing":
      return "preprocessing";
    case "rendering":
      return "capture";
    case "encoding":
      return "encode";
    case "assembling":
      return "postprocessing";
    case "complete":
      return "done";
    default:
      return null;
  }
}

function ensureDateAppAspectDir(outDir: string, job: JobSpec): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const aspectDir = job.aspect.replace(":", "-");
  const dir = join(outDir, today, job.app, aspectDir);
  mkdirSync(dir, { recursive: true });
  return dir;
}
