import { listTemplates } from "@marketing-engine/app/src/templates-list.ts";
import { loadTemplate, hydrateTemplate } from "@marketing-engine/app/src/template.ts";
import { renderJob } from "@marketing-engine/app/src/render.ts";
import { parseJobSpec } from "@marketing-engine/app/src/jobs.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRenderRunner, type RenderRunner } from "./render-runner.ts";
import type { TemplateListItem, RenderRequest } from "../shared/types.ts";

const ENGINE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "marketing-engine",
);
const OUT_DIR = join(ENGINE_ROOT, "out");

function buildRunner(): RenderRunner {
  return createRenderRunner({
    async runRender(req, onProgress) {
      const job = parseJobSpec({
        template: req.template,
        app: req.app,
        aspect: req.aspect,
        output: req.output,
        vars: req.vars,
      });
      const bundle = await loadTemplate(job.template, { rootDir: ENGINE_ROOT });
      const html = await hydrateTemplate(bundle, job.vars, { rootDir: ENGINE_ROOT });
      return renderJob({ job, html, outDir: OUT_DIR, rootDir: ENGINE_ROOT, onProgress });
    },
  });
}

const runner = buildRunner();

export interface AppLike {
  fetch(req: Request): Promise<Response>;
}

export function createApp(): AppLike {
  return {
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;

      if (method === "GET" && pathname === "/api/templates") {
        const list = await listTemplates({ rootDir: ENGINE_ROOT });
        const payload: TemplateListItem[] = list.map((t) => ({ schema: t.schema }));
        return Response.json(payload);
      }

      if (method === "POST" && pathname === "/api/renders") {
        if (runner.isBusy()) {
          return new Response(JSON.stringify({ error: "another render in progress" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          });
        }
        let body: RenderRequest;
        try {
          body = (await req.json()) as RenderRequest;
        } catch {
          return new Response(JSON.stringify({ error: "invalid JSON body" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const accepted = await runner.start(body);
          const result = runner.getResult(accepted.jobId);
          return Response.json({
            jobId: accepted.jobId,
            outputFile: result?.outputPath,
            durationMs: result?.durationMs,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
