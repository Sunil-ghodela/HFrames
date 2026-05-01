import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { resolveRef } from "./assets.ts";
import type { JobSpec } from "./jobs.ts";

export interface SlotSchema {
  type: "string" | "string[]" | "asset" | "color" | "number";
  min?: number;
  max?: number;
  required?: boolean;
  default?: string | number;
  kind?: "image" | "video" | "audio";
  description?: string;
}

export interface TemplateSchema {
  name: string;
  version: string;
  description: string;
  supportedAspects: ("9:16" | "1:1" | "16:9")[];
  defaultDuration: number;
  defaultFps: number;
  dimensions: Record<string, { width: number; height: number }>;
  slots: Record<string, SlotSchema>;
}

export interface TemplateBundle {
  name: string;
  html: string;
  schema: TemplateSchema;
  dir: string;
}

export interface TemplateContext {
  rootDir: string;
}

export async function loadTemplate(name: string, ctx: TemplateContext): Promise<TemplateBundle> {
  const dir = join(ctx.rootDir, "templates", name);
  if (!existsSync(dir)) {
    throw new Error(`Template not found: ${name} (looked in ${dir})`);
  }
  const htmlPath = join(dir, "template.html");
  const schemaPath = join(dir, "template.json");
  if (!existsSync(htmlPath) || !existsSync(schemaPath)) {
    throw new Error(`Template ${name} is missing template.html or template.json`);
  }
  const html = await readFile(htmlPath, "utf8");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as TemplateSchema;
  return { name, html, schema, dir };
}

export async function hydrateTemplate(
  tpl: TemplateBundle,
  job: JobSpec,
  ctx: TemplateContext,
): Promise<string> {
  validateRequiredSlots(tpl.schema, job);

  const window = new Window();
  // happy-dom 20.x's BrowserWindow doesn't pre-populate certain globals
  // (SyntaxError, DOMException, etc.). Vitest's happy-dom environment
  // uses GlobalWindow which does, so tests work; running through a Bun
  // server (dashboard) hits the gap and throws meta-errors like "undefined
  // is not a constructor (evaluating 'new this.window.SyntaxError(...)')"
  // when the selector parser tries to throw.
  injectWindowGlobals(window as unknown as Record<string, unknown>);
  const document = window.document;
  document.documentElement.innerHTML = stripDoctype(tpl.html);

  // Apply dimensions for the requested aspect
  const stage = document.getElementById("stage");
  if (!stage) {
    throw new Error(`Template ${tpl.name} is missing #stage element`);
  }
  const dims = tpl.schema.dimensions[job.aspect];
  if (!dims) {
    throw new Error(`Template ${tpl.name} does not declare dimensions for aspect ${job.aspect}`);
  }
  stage.setAttribute("data-width", String(dims.width));
  stage.setAttribute("data-height", String(dims.height));
  if (job.duration) {
    stage.setAttribute("data-duration", String(job.duration));
  }

  // Resolve slot defaults from schema, then merge with job.vars
  const merged: Record<string, unknown> = {};
  for (const [slot, def] of Object.entries(tpl.schema.slots)) {
    if (def.default !== undefined) merged[slot] = def.default;
  }
  Object.assign(merged, job.vars);

  // Walk every [data-slot] element and hydrate — sequential for deterministic asset resolution
  const slotEls = Array.from(document.querySelectorAll("[data-slot]"));
  for (const el of slotEls) {
    const slotName = el.getAttribute("data-slot");
    if (!slotName) continue;
    const slotDef = tpl.schema.slots[slotName];
    if (!slotDef) {
      throw new Error(`Template ${tpl.name} declares slot ${slotName} not in schema`);
    }
    let value = merged[slotName];

    // Resolve asset refs (e.g. @brand/craftlee-saffron → "#FF9933")
    if (typeof value === "string") {
      value = await resolveRef(value, ctx);
    }

    if (value === undefined || value === null || value === "") {
      // Optional slot with no value: blank textContent (placeholder may still be styled)
      el.textContent = "";
      continue;
    }

    if (slotDef.type === "string[]" && Array.isArray(value)) {
      // Cast is safe: we validated in validateRequiredSlots that items exist
      const lines = value as unknown[];
      el.innerHTML = lines
        .map((line) => `<div class="line">${escapeHtml(String(line))}</div>`)
        .join("");
      continue;
    }

    if (el.tagName === "IMG" || el.tagName === "VIDEO") {
      // Schema for "background"-style slots allows a brand color in place
      // of an image URL. Render as solid color rather than a broken
      // <img src="#FFF8E7">. Cast: happy-dom's Element doesn't expose
      // .style, but IMG/VIDEO are HTMLElements at runtime.
      const str = String(value);
      if (/^#[0-9a-fA-F]{3,8}$/.test(str)) {
        el.removeAttribute("src");
        const styled = el as unknown as {
          style: { setProperty: (k: string, v: string) => void };
        };
        styled.style.setProperty("background-color", str);
      } else {
        el.setAttribute("src", str);
      }
      continue;
    }

    el.textContent = String(value);
  }

  // Apply CSS vars for accent-color from brand onto stage
  const accent = await maybeResolve(merged.accentColor, ctx);
  if (accent) stage.style.setProperty("--accent-color", accent);

  return "<!doctype html>\n" + document.documentElement.outerHTML;
}

function validateRequiredSlots(schema: TemplateSchema, job: JobSpec): void {
  for (const [name, def] of Object.entries(schema.slots)) {
    if (def.required === true && !(name in job.vars)) {
      throw new Error(`Template ${schema.name} requires slot '${name}'`);
    }
    if (def.type === "string[]" && Array.isArray(job.vars[name])) {
      // Cast is safe: we just checked Array.isArray
      const arr = job.vars[name] as unknown[];
      if (def.min !== undefined && arr.length < def.min) {
        throw new Error(`Slot '${name}' requires min ${def.min} items, got ${arr.length}`);
      }
      if (def.max !== undefined && arr.length > def.max) {
        throw new Error(`Slot '${name}' allows max ${def.max} items, got ${arr.length}`);
      }
    }
  }
}

async function maybeResolve(v: unknown, ctx: TemplateContext): Promise<string | null> {
  if (typeof v !== "string") return null;
  return resolveRef(v, ctx);
}

function injectWindowGlobals(window: Record<string, unknown>): void {
  for (const name of [
    "SyntaxError",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "EvalError",
    "URIError",
    "Error",
  ] as const) {
    if (window[name] == null) window[name] = (globalThis as Record<string, unknown>)[name];
  }
}

function stripDoctype(html: string): string {
  return html.replace(/<!doctype[^>]*>/i, "").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
