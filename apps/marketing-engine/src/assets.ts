import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ResolverContext {
  rootDir: string;
}

export function isAssetRef(value: unknown): value is string {
  return typeof value === "string" && /^@(brand|asset|font)\//.test(value);
}

export async function resolveRef(value: unknown, ctx: ResolverContext): Promise<string> {
  if (typeof value !== "string") {
    throw new Error(`resolveRef expected string, got ${typeof value}`);
  }
  if (!isAssetRef(value)) {
    return value;
  }
  const [namespace, rest] = value.slice(1).split("/", 2);
  if (!namespace || !rest) {
    throw new Error(`Malformed asset ref: ${value}`);
  }
  if (namespace === "brand") {
    return resolveBrandRef(rest, ctx);
  }
  if (namespace === "asset") {
    return resolveAssetFile(rest, ctx);
  }
  if (namespace === "font") {
    return resolveFontRef(rest, ctx);
  }
  throw new Error(`Unknown asset namespace: ${namespace} (in ${value})`);
}

async function resolveBrandRef(rest: string, ctx: ResolverContext): Promise<string> {
  const dashIdx = rest.indexOf("-");
  if (dashIdx < 0) {
    throw new Error(`@brand ref must be <app>-<key>: got @brand/${rest}`);
  }
  const app = rest.slice(0, dashIdx);
  const key = rest.slice(dashIdx + 1);
  const brandPath = join(ctx.rootDir, "assets", "brand", `${app}.json`);
  if (!existsSync(brandPath)) {
    throw new Error(`Brand kit not found: ${brandPath}`);
  }
  const kit: unknown = JSON.parse(await readFile(brandPath, "utf8"));
  return lookupBrandKey(kit, key, app);
}

function isBrandKit(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function lookupBrandKey(kit: unknown, key: string, app: string): string {
  if (!isBrandKit(kit)) {
    throw new Error(`Brand kit for ${app} is malformed`);
  }
  // Try colors section
  if (isStringRecord(kit["colors"])) {
    const v = kit["colors"][key];
    if (typeof v === "string") return v;
  }
  // Try fonts section
  if (isStringRecord(kit["fonts"])) {
    const v = kit["fonts"][key];
    if (typeof v === "string") return v;
  }
  // Try cta section (key "cta" maps to kit.cta.default)
  if (key === "cta" && isStringRecord(kit["cta"])) {
    const v = kit["cta"]["default"];
    if (typeof v === "string") return v;
  }
  throw new Error(`@brand/${app}-${key} not found in ${app} brand kit`);
}

async function resolveAssetFile(rest: string, ctx: ResolverContext): Promise<string> {
  // Search assets/{music,images,videos}/<rest>.<ext>
  const candidates = [
    join(ctx.rootDir, "assets", "music", rest),
    join(ctx.rootDir, "assets", "images", rest),
    join(ctx.rootDir, "assets", "videos", rest),
  ];
  for (const c of candidates) {
    for (const ext of ["", ".mp3", ".wav", ".png", ".jpg", ".mp4", ".webm"]) {
      const p = c + ext;
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`@asset/${rest} not found in assets/{music,images,videos}/`);
}

async function resolveFontRef(rest: string, _ctx: ResolverContext): Promise<string> {
  // Phase A: only resolves font *family name* via brand kit lookup.
  // Future: resolves to a TTF path if the font file is bundled.
  // For now: throw, since templates use @brand/<app>-<font-key>.
  throw new Error(
    `@font/<key> not supported in Phase A. Use @brand/<app>-<font-key> instead. Got: @font/${rest}`,
  );
}
