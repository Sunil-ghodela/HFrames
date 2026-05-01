import { describe, it, expect } from "vitest";
import { createApp } from "../../src/server/routes.ts";

describe("GET /api/templates", () => {
  it("returns the list of templates", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/api/templates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const sr = body.find((t: { schema: { name: string } }) => t.schema.name === "shayari-reel");
    expect(sr).toBeDefined();
  });

  it("returns 404 for unknown routes", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/api/no-such-thing"));
    expect(res.status).toBe(404);
  });
});
