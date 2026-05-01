import { listTemplates } from "@marketing-engine/app/src/templates-list.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { TemplateListItem } from "../shared/types.ts";

// Resolve the engine package's root directory so we can read templates/, assets/.
const ENGINE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "marketing-engine",
);

export interface AppLike {
  fetch(req: Request): Promise<Response>;
}

export function createApp(): AppLike {
  return {
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;

      if (method === "GET" && pathname === "/api/templates") {
        const list = await listTemplates({ rootDir: ENGINE_ROOT });
        const payload: TemplateListItem[] = list.map((t) => ({ schema: t.schema }));
        return Response.json(payload);
      }

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
