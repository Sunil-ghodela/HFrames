import { describe, it, expect } from "vitest";
import { listAssets } from "../src/asset-list.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("listAssets", () => {
  it("returns image assets, excluding the brand subdirectory", async () => {
    const assets = await listAssets({ rootDir: ROOT });
    const names = assets.map((a) => a.name);
    expect(names).toContain("sample-bg.png");
    expect(names.every((n) => !n.startsWith("brand/"))).toBe(true);
  });

  it("each entry has kind and relative path", async () => {
    const assets = await listAssets({ rootDir: ROOT });
    const sample = assets.find((a) => a.name === "sample-bg.png");
    expect(sample).toBeDefined();
    expect(sample!.kind).toBe("image");
    expect(sample!.relPath).toBe("sample-bg.png");
  });
});
