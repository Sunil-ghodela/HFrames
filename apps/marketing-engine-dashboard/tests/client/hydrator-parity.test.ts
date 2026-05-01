import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTemplate, hydrateTemplate } from "@marketing-engine/app/src/template.ts";
import { hydrateInDocument } from "../../src/client/preview/hydrator.ts";
import { createClientResolver } from "../../src/client/preview/asset-resolver.ts";
import type { BrandJSON, AspectRatio, TemplateSchema } from "../../src/shared/types.ts";

const ENGINE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "marketing-engine",
);

interface FixtureJob {
  template: string;
  app: string;
  aspect: AspectRatio;
  output: { name: string; formats: ["mp4"] };
  vars: Record<string, unknown>;
  duration?: number;
}

describe("hydrator parity (client vs engine)", () => {
  it("produces equivalent text/attrs for shayari-reel minimal fixture", async () => {
    const bundle = await loadTemplate("shayari-reel", { rootDir: ENGINE_ROOT });
    const fixturePath = join(ENGINE_ROOT, "templates/shayari-reel/fixtures/minimal.json");
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as FixtureJob;

    // Engine hydrator (happy-dom internally)
    const engineHtml = await hydrateTemplate(bundle, fixture, { rootDir: ENGINE_ROOT });

    // Client hydrator on the same template HTML, against the test env's
    // happy-dom Document.
    const brandJson = JSON.parse(
      await readFile(join(ENGINE_ROOT, "assets/brand/craftlee.json"), "utf8"),
    ) as BrandJSON;
    const resolve = createClientResolver({
      brands: { [fixture.app]: brandJson },
      assetUrl: (n) => `/api/assets/file?name=${n}`,
    });

    document.documentElement.innerHTML = stripDoctype(bundle.html);
    await hydrateInDocument(
      document,
      {
        schema: bundle.schema as unknown as TemplateSchema,
        vars: fixture.vars,
        aspect: fixture.aspect,
        duration: fixture.duration,
      },
      resolve,
    );
    const clientHtml = document.documentElement.outerHTML;

    expect(extractContent(clientHtml)).toEqual(extractContent(engineHtml));
  });
});

function stripDoctype(html: string): string {
  return html.replace(/<!doctype[^>]*>/i, "").trim();
}

function extractContent(html: string): { text: string[]; attrs: string[] } {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const text: string[] = [];
  const attrs: string[] = [];
  // Walk all elements
  const all = dom.querySelectorAll("*");
  for (const el of Array.from(all)) {
    for (const a of el.getAttributeNames()) {
      // Engine adds data-width/data-height/data-duration on #stage; include those
      if (["src", "href", "data-width", "data-height", "data-duration", "data-slot"].includes(a)) {
        attrs.push(`${a}=${el.getAttribute(a)}`);
      }
    }
    // Direct text children only (avoid double-counting)
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        const t = child.textContent?.trim();
        if (t) text.push(t);
      }
    }
  }
  return { text, attrs };
}
