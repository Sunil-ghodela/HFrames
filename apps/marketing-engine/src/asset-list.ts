import { readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

export type AssetKind = "image" | "audio" | "video" | "other";

export interface AssetEntry {
  name: string;
  relPath: string;
  absPath: string;
  kind: AssetKind;
}

export interface ListAssetsContext {
  rootDir: string;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm"]);

function classify(ext: string): AssetKind {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return "image";
  if (AUDIO_EXTS.has(e)) return "audio";
  if (VIDEO_EXTS.has(e)) return "video";
  return "other";
}

export async function listAssets(ctx: ListAssetsContext): Promise<AssetEntry[]> {
  const assetsDir = join(ctx.rootDir, "assets");
  const out: AssetEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir);
    for (const name of entries) {
      const abs = join(dir, name);
      const s = await stat(abs);
      if (s.isDirectory()) {
        // Skip the brand subdirectory — those are JSON kits, not media assets
        if (relative(assetsDir, abs) === "brand") continue;
        await walk(abs);
      } else {
        const kind = classify(extname(name));
        if (kind === "other") continue;
        const rel = relative(assetsDir, abs);
        out.push({ name: rel, relPath: rel, absPath: abs, kind });
      }
    }
  }

  await walk(assetsDir);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
