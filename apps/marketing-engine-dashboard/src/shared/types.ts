// Wire types shared by the dashboard server and client.
//
// These mirror the engine's public shapes intentionally rather than importing
// them transitively, so the dashboard's tsc does not have to type-check
// engine source code (which lives in another package and uses its own
// tsconfig). Engine and dashboard are pinned by the workspace symlink, so
// drift is caught by integration tests, not the type system.

export type AspectRatio = "9:16" | "1:1" | "16:9";

export interface SlotSchema {
  type: string;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  description?: string;
  [k: string]: unknown;
}

export interface TemplateSchema {
  name: string;
  slots: Record<string, SlotSchema>;
  defaults?: Record<string, unknown>;
  supportedAspects: string[];
  dimensions?: { width: number; height: number };
  duration?: number;
  [k: string]: unknown;
}

export interface BrandJSON {
  name: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  cta?: { default?: string; [k: string]: string | undefined };
}

export type AssetKind = "image" | "audio" | "video" | "other";

export interface AssetEntry {
  name: string;
  relPath: string;
  absPath: string;
  kind: AssetKind;
}

export type RenderProgressPhase =
  | "preprocessing"
  | "capture"
  | "encode"
  | "postprocessing"
  | "done";

export interface RenderProgress {
  phase: RenderProgressPhase;
  progress: number;
  message?: string;
}

export interface TemplateListItem {
  schema: TemplateSchema;
}

export interface RenderRequest {
  template: string;
  app: string;
  aspect: AspectRatio;
  vars: Record<string, unknown>;
  output: { name: string; formats: ["mp4"] };
}

export interface RenderJobAccepted {
  jobId: string;
}

export interface RenderJobStatus {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  progress?: RenderProgress;
  outputFile?: string;
  error?: string;
}

export type RenderEvent =
  | { type: "progress"; data: RenderProgress }
  | { type: "done"; data: { outputFile: string; durationMs: number } }
  | { type: "error"; data: { message: string } };

export interface OpenFolderRequest {
  file: string;
}

export interface ApiError {
  error: string;
}
