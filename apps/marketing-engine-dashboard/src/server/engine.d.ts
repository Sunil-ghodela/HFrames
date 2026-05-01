// Ambient module declarations for the @marketing-engine/app subpath imports
// the dashboard server consumes at runtime. We mirror the engine's public API
// here rather than have tsc transitively type-check engine source — the
// engine has its own tsconfig with different lib/strictness settings, and
// pulling it into the dashboard's project surfaces unrelated cross-package
// errors. Drift between these declarations and the engine is caught by the
// integration test in tests/e2e.smoke.test.ts.

declare module "@marketing-engine/app/src/templates-list.ts" {
  import type { TemplateSchema } from "../shared/types.ts";
  export interface TemplateListEntry {
    schema: TemplateSchema;
    htmlPath: string;
    dir: string;
  }
  export interface ListTemplatesContext {
    rootDir: string;
  }
  export function listTemplates(ctx: ListTemplatesContext): Promise<TemplateListEntry[]>;
}

declare module "@marketing-engine/app/src/template.ts" {
  import type { TemplateSchema } from "../shared/types.ts";
  export interface TemplateBundle {
    schema: TemplateSchema;
    html: string;
    dir: string;
  }
  export interface TemplateContext {
    rootDir: string;
  }
  export function loadTemplate(name: string, ctx: TemplateContext): Promise<TemplateBundle>;
  export function hydrateTemplate(
    bundle: TemplateBundle,
    slots: Record<string, unknown>,
    ctx: TemplateContext,
  ): Promise<string>;
}

declare module "@marketing-engine/app/src/jobs.ts" {
  export interface JobSpec {
    template: string;
    app: string;
    aspect: string;
    duration?: number;
    output: { name: string; formats: ["mp4"] };
    vars: Record<string, unknown>;
  }
  export function parseJobSpec(input: unknown): JobSpec;
}

declare module "@marketing-engine/app/src/render.ts" {
  import type { RenderProgress } from "../shared/types.ts";
  import type { JobSpec } from "@marketing-engine/app/src/jobs.ts";
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
  export function renderJob(args: RenderArgs): Promise<RenderResult>;
}

declare module "@marketing-engine/app/src/assets.ts" {
  import type { BrandJSON } from "../shared/types.ts";
  export interface ResolverContext {
    rootDir: string;
  }
  export function loadBrand(name: string, ctx: ResolverContext): Promise<BrandJSON>;
  export function isAssetRef(value: unknown): value is string;
  export function resolveRef(value: unknown, ctx: ResolverContext): Promise<string>;
}

declare module "@marketing-engine/app/src/asset-list.ts" {
  import type { AssetEntry } from "../shared/types.ts";
  export interface ListAssetsContext {
    rootDir: string;
  }
  export function listAssets(ctx: ListAssetsContext): Promise<AssetEntry[]>;
}
