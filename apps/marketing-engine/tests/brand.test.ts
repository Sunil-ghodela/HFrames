import { describe, it, expect } from "vitest";
import { loadBrand } from "../src/assets.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("loadBrand", () => {
  it("returns parsed craftlee brand JSON", async () => {
    const brand = await loadBrand("craftlee", { rootDir: ROOT });
    expect(brand.name).toBe("CraftLee");
    expect(brand.colors.saffron).toBe("#FF9933");
    expect(brand.fonts["devanagari-display"]).toBe("Mukta");
  });

  it("throws for unknown brand", async () => {
    await expect(loadBrand("nonexistent", { rootDir: ROOT })).rejects.toThrow();
  });
});
