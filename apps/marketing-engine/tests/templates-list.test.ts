import { describe, it, expect } from "vitest";
import { listTemplates } from "../src/templates-list.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("listTemplates", () => {
  it("returns all templates with parsed schema", async () => {
    const templates = await listTemplates({ rootDir: ROOT });
    const names = templates.map((t) => t.schema.name).sort();
    expect(names).toContain("shayari-reel");
  });

  it("each entry has slots, supportedAspects, and html path", async () => {
    const templates = await listTemplates({ rootDir: ROOT });
    const sr = templates.find((t) => t.schema.name === "shayari-reel");
    expect(sr).toBeDefined();
    expect(Object.keys(sr!.schema.slots)).toContain("shayariLines");
    expect(sr!.schema.supportedAspects).toContain("9:16");
    expect(sr!.htmlPath).toMatch(/templates\/shayari-reel\/template\.html$/);
  });
});
