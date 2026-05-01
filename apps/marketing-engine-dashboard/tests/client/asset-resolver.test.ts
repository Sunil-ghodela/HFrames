import { describe, it, expect } from "vitest";
import { createClientResolver } from "../../src/client/preview/asset-resolver.ts";
import type { BrandJSON } from "../../src/shared/types.ts";

const CRAFTLEE: BrandJSON = {
  name: "CraftLee",
  colors: { saffron: "#FF9933", paper: "#FFF8E7" },
  fonts: { "devanagari-display": "Mukta" },
  cta: { default: "CraftLee se banayein →" },
};

describe("createClientResolver", () => {
  it("resolves @brand/craftlee-saffron to color hex", async () => {
    const resolve = createClientResolver({ brands: { craftlee: CRAFTLEE }, assetUrl: () => "" });
    expect(await resolve("@brand/craftlee-saffron")).toBe("#FF9933");
  });

  it("resolves @brand/craftlee-cta to CTA copy", async () => {
    const resolve = createClientResolver({ brands: { craftlee: CRAFTLEE }, assetUrl: () => "" });
    expect(await resolve("@brand/craftlee-cta")).toBe("CraftLee se banayein →");
  });

  it("resolves @asset/<name> to a URL via assetUrl()", async () => {
    const resolve = createClientResolver({
      brands: { craftlee: CRAFTLEE },
      assetUrl: (name) => `/assets/${name}`,
    });
    expect(await resolve("@asset/sample-bg.png")).toBe("/assets/sample-bg.png");
  });

  it("returns plain values unchanged", async () => {
    const resolve = createClientResolver({ brands: { craftlee: CRAFTLEE }, assetUrl: () => "" });
    expect(await resolve("#FF9933")).toBe("#FF9933");
  });
});
