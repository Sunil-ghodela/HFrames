import { describe, it, expect } from "vitest";
import { validateSlots } from "../../src/client/slot-editor/validate.ts";
import type { TemplateSchema } from "../../src/shared/types.ts";

const SCHEMA: TemplateSchema = {
  name: "shayari-reel",
  supportedAspects: ["9:16"],
  slots: {
    shayariLines: { type: "string[]", min: 2, max: 4, required: true, description: "" },
    festivalName: { type: "string", required: false, description: "" },
    accentColor: { type: "color", default: "@brand/craftlee-saffron", description: "" },
  },
};

describe("validateSlots", () => {
  it("rejects when required slot is empty", () => {
    const r = validateSlots(SCHEMA, {});
    expect(r.valid).toBe(false);
    expect(r.errors["shayariLines"]).toBeDefined();
  });

  it("rejects when string[] is below min", () => {
    const r = validateSlots(SCHEMA, { shayariLines: ["only one"] });
    expect(r.valid).toBe(false);
    expect(r.errors["shayariLines"]).toMatch(/at least 2/);
  });

  it("accepts a valid spec", () => {
    const r = validateSlots(SCHEMA, { shayariLines: ["a", "b"] });
    expect(r.valid).toBe(true);
  });

  it("accepts @brand/ token for color", () => {
    const r = validateSlots(SCHEMA, {
      shayariLines: ["a", "b"],
      accentColor: "@brand/craftlee-saffron",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects malformed color", () => {
    const r = validateSlots(SCHEMA, {
      shayariLines: ["a", "b"],
      accentColor: "not-a-color",
    });
    expect(r.valid).toBe(false);
  });
});
