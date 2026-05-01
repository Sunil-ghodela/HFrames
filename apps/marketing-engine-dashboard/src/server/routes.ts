import { listTemplates } from "@marketing-engine/app/src/templates-list.ts";
import { loadTemplate, hydrateTemplate } from "@marketing-engine/app/src/template.ts";
import { renderJob } from "@marketing-engine/app/src/render.ts";
import { parseJobSpec } from "@marketing-engine/app/src/jobs.ts";
import { loadBrand } from "@marketing-engine/app/src/assets.ts";
import { listAssets } from "@marketing-engine/app/src/asset-list.ts";
import { fileURLToPath } from "node:url";
import { dirname, join, dirname as pathDirname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
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

      if (method === "POST" && pathname === "/api/open-folder") {
        let body: { file?: string };
        try {
          body = (await req.json()) as { file?: string };
        } catch {
          return new Response(JSON.stringify({ error: "invalid JSON body" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const file = body.file ?? "";
        const outRoot = join(ENGINE_ROOT, "out") + "/";
        if (!file || !file.startsWith(outRoot)) {
          return new Response(JSON.stringify({ error: "invalid file" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const dir = pathDirname(file);
        const cmd = process.platform === "darwin" ? "open" : "xdg-open";
        spawn(cmd, [dir], { detached: true, stdio: "ignore" }).unref();
        return new Response(null, { status: 204 });
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
        // Validate the JobSpec synchronously so 400/422 errors come back at
        // POST time rather than via SSE; runner.start() then kicks off async.
        try {
          parseJobSpec({
            template: body.template,
            app: body.app,
            aspect: body.aspect,
            output: body.output,
            vars: body.vars,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const { jobId } = runner.start(body);
        return Response.json({ jobId });
      }

      if (method === "GET" && pathname === "/api/assets") {
        const assets = await listAssets({ rootDir: ENGINE_ROOT });
        return Response.json(
          assets.map((a) => ({ name: a.name, relPath: a.relPath, kind: a.kind })),
        );
      }

      if (method === "GET" && pathname === "/api/assets/file") {
        const name = url.searchParams.get("name");
        if (!name) return new Response("missing name", { status: 400 });
        if (name.includes("..") || name.startsWith("/")) {
          return new Response("invalid name", { status: 400 });
        }
        const abs = join(ENGINE_ROOT, "assets", name);
        try {
          const s = await stat(abs);
          if (!s.isFile()) return new Response("not found", { status: 404 });
          return new Response(Bun.file(abs));
        } catch {
          return new Response("not found", { status: 404 });
        }
      }

      if (method === "GET") {
        const eventsMatch = pathname.match(/^\/api\/renders\/([^/]+)\/events$/);
        if (eventsMatch) {
          const jobId = decodeURIComponent(eventsMatch[1] as string);
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              let closed = false;
              const send = (ev: unknown) => {
                if (closed) return;
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
                } catch {
                  closed = true;
                }
              };
              const sendComment = (text: string) => {
                if (closed) return;
                try {
                  controller.enqueue(encoder.encode(`: ${text}\n\n`));
                } catch {
                  closed = true;
                }
              };
              // Bun.serve enforces a per-request idleTimeout (max 255s).
              // During the renderer's compile + capture phases there can
              // be tens of seconds with no progress events; without
              // periodic traffic Bun closes the SSE socket and the
              // client sees a 500 / "lost connection" error mid-render.
              // Send an SSE comment heartbeat every 15s to keep the
              // connection considered active.
              const heartbeat = setInterval(() => sendComment("keepalive"), 15_000);
              const cleanup = runner.subscribe(jobId, (ev) => {
                send(ev);
                if (ev.type === "done" || ev.type === "error") {
                  clearInterval(heartbeat);
                  closed = true;
                  try {
                    controller.close();
                  } catch {
                    // already closed
                  }
                  cleanup();
                }
              });
              const result = runner.getResult(jobId);
              if (result) {
                send({
                  type: "done",
                  data: { outputFile: result.outputPath, durationMs: result.durationMs },
                });
                clearInterval(heartbeat);
                closed = true;
                try {
                  controller.close();
                } catch {
                  // already closed
                }
                cleanup();
              }
            },
          });
          return new Response(stream, {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              connection: "keep-alive",
            },
          });
        }

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
