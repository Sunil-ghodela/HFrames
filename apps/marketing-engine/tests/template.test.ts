import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTemplate, hydrateTemplate } from "../src/template.ts";
import type { JobSpec } from "../src/jobs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("template loader", () => {
  it("loads shayari-reel template + schema", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    expect(tpl.name).toBe("shayari-reel");
    expect(tpl.schema.slots.shayariLines.required).toBe(true);
    expect(tpl.html).toContain('data-composition-id="shayari-reel"');
  });

  it("throws on unknown template", async () => {
    await expect(loadTemplate("does-not-exist", { rootDir: ROOT })).rejects.toThrow(/not found/);
  });
});

describe("template hydration", () => {
  const baseJob: JobSpec = {
    template: "shayari-reel",
    app: "craftlee",
    aspect: "9:16",
    output: { name: "test", formats: ["mp4"] },
    vars: {
      shayariLines: ["pehli line", "doosri line"],
      festivalName: "Holi",
    },
  };

  it("injects shayariLines as <div class='line'> children", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const html = await hydrateTemplate(tpl, baseJob, { rootDir: ROOT });
    expect(html).toContain(">pehli line<");
    expect(html).toContain(">doosri line<");
    const matches = html.match(/class="line"/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("sets festivalName text content when provided", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const html = await hydrateTemplate(tpl, baseJob, { rootDir: ROOT });
    expect(html).toMatch(/festival-badge[^>]*>Holi</);
  });

  it("removes festivalName element when slot omitted", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const job = { ...baseJob, vars: { shayariLines: ["x", "y"] } };
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });
    expect(html).not.toMatch(/festival-badge[^>]*>[^<\s]/);
  });

  it("rejects job missing required shayariLines", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const bad = { ...baseJob, vars: {} };
    await expect(hydrateTemplate(tpl, bad, { rootDir: ROOT })).rejects.toThrow(/shayariLines/);
  });

  it("applies aspect-ratio dimensions to stage", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const job = { ...baseJob, aspect: "1:1" as const };
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });
    expect(html).toMatch(/data-width="1080"/);
    expect(html).toMatch(/data-height="1080"/);
  });

  it("escapes HTML special characters in line content", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const job = {
      ...baseJob,
      vars: { shayariLines: ["<script>x</script>", "& & &"] },
    };
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
