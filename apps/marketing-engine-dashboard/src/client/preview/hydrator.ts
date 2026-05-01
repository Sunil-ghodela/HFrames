import type { ClientResolver } from "./asset-resolver.ts";
import type { TemplateSchema, AspectRatio } from "../../shared/types.ts";

/**
 * Client-side port of apps/marketing-engine/src/template.ts:hydrateTemplate.
 * Operates on a real Document instead of constructing a happy-dom one.
 *
 * Algorithm parity with the engine is enforced by hydrator-parity.test.ts.
 * If the engine's hydrateTemplate changes, update both here and that test.
 */
export interface HydrateInput {
  schema: TemplateSchema;
  vars: Record<string, unknown>;
  aspect: AspectRatio;
  duration?: number;
}

export async function hydrateInDocument(
  doc: Document,
  input: HydrateInput,
  resolve: ClientResolver,
): Promise<void> {
  const stage = doc.getElementById("stage");
  if (!stage) {
    throw new Error(`Template missing #stage element`);
  }
  const dims = (input.schema.dimensions as Record<string, { width: number; height: number }>)[
    input.aspect
  ];
  if (!dims) {
    throw new Error(`Template does not declare dimensions for aspect ${input.aspect}`);
  }
  stage.setAttribute("data-width", String(dims.width));
  stage.setAttribute("data-height", String(dims.height));
  if (input.duration) {
    stage.setAttribute("data-duration", String(input.duration));
  }

  // Merge defaults under user vars
  const merged: Record<string, unknown> = {};
  for (const [slot, def] of Object.entries(input.schema.slots)) {
    if ("default" in def && def.default !== undefined) merged[slot] = def.default;
  }
  Object.assign(merged, input.vars);

  // Hydrate every [data-slot] sequentially (matches engine's deterministic order)
  const slotEls = Array.from(doc.querySelectorAll<HTMLElement>("[data-slot]"));
  for (const el of slotEls) {
    const slotName = el.getAttribute("data-slot");
    if (!slotName) continue;
    const slotDef = input.schema.slots[slotName];
    if (!slotDef) {
      throw new Error(`Template declares slot ${slotName} not in schema`);
    }

    let value = merged[slotName];

    if (typeof value === "string") {
      value = await resolve(value);
    }

    if (value === undefined || value === null || value === "") {
      el.textContent = "";
      continue;
    }

    if (slotDef.type === "string[]" && Array.isArray(value)) {
      el.innerHTML = (value as unknown[])
        .map((line) => `<div class="line">${escapeHtml(String(line))}</div>`)
        .join("");
      continue;
    }

    if (el.tagName === "IMG" || el.tagName === "VIDEO") {
      el.setAttribute("src", String(value));
      continue;
    }

    el.textContent = String(value);
  }

  const accent = await maybeResolveString(merged.accentColor, resolve);
  if (accent && stage instanceof HTMLElement) {
    stage.style.setProperty("--accent-color", accent);
  }
}

async function maybeResolveString(v: unknown, resolve: ClientResolver): Promise<string | null> {
  if (typeof v !== "string") return null;
  const out = await resolve(v);
  return typeof out === "string" ? out : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
