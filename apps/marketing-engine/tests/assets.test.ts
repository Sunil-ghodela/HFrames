import { describe, it, expect } from "vitest";
import { resolveRef, isAssetRef } from "../src/assets.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("asset resolver", () => {
  it("isAssetRef detects @brand and @asset refs", () => {
    expect(isAssetRef("@brand/craftlee-saffron")).toBe(true);
    expect(isAssetRef("@asset/calm-flute-01")).toBe(true);
    expect(isAssetRef("@font/devanagari-display")).toBe(true);
    expect(isAssetRef("plain-string")).toBe(false);
    expect(isAssetRef("#FF9933")).toBe(false);
  });

  it("resolves @brand/<app>-<key> to color value", async () => {
    const v = await resolveRef("@brand/craftlee-saffron", { rootDir: ROOT });
    expect(v).toBe("#FF9933");
  });

  it("resolves @brand/<app>-<key> for font name", async () => {
    const v = await resolveRef("@brand/craftlee-devanagari-display", { rootDir: ROOT });
    expect(v).toBe("Mukta");
  });

  it("resolves @brand/<app>-cta to CTA copy", async () => {
    const v = await resolveRef("@brand/craftlee-cta", { rootDir: ROOT });
    expect(v).toBe("CraftLee se banayein →");
  });

  it("throws on unknown brand key", async () => {
    await expect(resolveRef("@brand/craftlee-nonsense", { rootDir: ROOT })).rejects.toThrow(
      /not found/,
    );
  });

  it("returns plain strings unchanged", async () => {
    const v = await resolveRef("just a string", { rootDir: ROOT });
    expect(v).toBe("just a string");
  });
});
