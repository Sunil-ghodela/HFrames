import { listTemplates } from "@marketing-engine/app/src/templates-list.ts";
import { loadTemplate, hydrateTemplate } from "@marketing-engine/app/src/template.ts";
import { renderJob } from "@marketing-engine/app/src/render.ts";
import { parseJobSpec } from "@marketing-engine/app/src/jobs.ts";
import { loadBrand } from "@marketing-engine/app/src/assets.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, stat } from "node:fs/promises";
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
      const html = await hydrateTemplate(bundle, job, { rootDir: ENGINE_ROOT });
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

      if (method === "GET") {
        const htmlMatch = pathname.match(/^\/api\/templates\/([^/]+)\/html$/);
        if (htmlMatch) {
          const name = decodeURIComponent(htmlMatch[1] as string);
          const list = await listTemplates({ rootDir: ENGINE_ROOT });
          const t = list.find((x) => x.schema.name === name);
          if (!t) return new Response("not found", { status: 404 });
          const html = await readFile(t.htmlPath, "utf8");
          return new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        const brandMatch = pathname.match(/^\/api\/brand\/([^/]+)$/);
        if (brandMatch) {
          const name = decodeURIComponent(brandMatch[1] as string);
          try {
            const brand = await loadBrand(name, { rootDir: ENGINE_ROOT });
            return Response.json(brand);
          } catch {
            return new Response("not found", { status: 404 });
          }
        }

        const fileMatch = pathname.match(/^\/api\/renders\/([^/]+)\/file$/);
        if (fileMatch) {
          const jobId = decodeURIComponent(fileMatch[1] as string);
          const result = runner.getResult(jobId);
          if (!result) return new Response("not found", { status: 404 });
          try {
            const s = await stat(result.outputPath);
            return new Response(Bun.file(result.outputPath), {
              headers: {
                "content-type": "video/mp4",
                "content-length": String(s.size),
              },
            });
          } catch {
            return new Response("file not found", { status: 404 });
          }
        }
      }

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
