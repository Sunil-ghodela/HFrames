import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TemplateSchema } from "./template.ts";

export interface TemplateListEntry {
  schema: TemplateSchema;
  htmlPath: string;
  dir: string;
}

export interface ListTemplatesContext {
  rootDir: string;
}

export async function listTemplates(ctx: ListTemplatesContext): Promise<TemplateListEntry[]> {
  const templatesDir = join(ctx.rootDir, "templates");
  const entries = await readdir(templatesDir);
  const result: TemplateListEntry[] = [];

  for (const name of entries) {
    const dir = join(templatesDir, name);
    const dirStat = await stat(dir);
    if (!dirStat.isDirectory()) continue;

    const jsonPath = join(dir, "template.json");
    try {
      const raw = await readFile(jsonPath, "utf8");
      const schema = JSON.parse(raw) as TemplateSchema;
      result.push({
        schema,
        htmlPath: join(dir, "template.html"),
        dir,
      });
    } catch {
      // Directory without template.json — skip silently
    }
  }

  result.sort((a, b) => a.schema.name.localeCompare(b.schema.name));
  return result;
}
