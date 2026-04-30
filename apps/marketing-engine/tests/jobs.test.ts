import { describe, it, expect } from "vitest";
import { JobSpecSchema, parseJobSpec, type JobSpec } from "../src/jobs.ts";

describe("JobSpec schema", () => {
  it("accepts a minimal valid spec", () => {
    const spec = {
      template: "shayari-reel",
      app: "craftlee",
      aspect: "9:16",
      output: { name: "test", formats: ["mp4"] },
      vars: { shayariLines: ["line one", "line two"] },
    };
    const result = JobSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it("rejects unknown app value", () => {
    const spec = {
      template: "shayari-reel",
      app: "not-an-app",
      aspect: "9:16",
      output: { name: "test", formats: ["mp4"] },
      vars: {},
    };
    expect(JobSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects unsupported aspect", () => {
    const spec = {
      template: "x",
      app: "craftlee",
      aspect: "21:9",
      output: { name: "test", formats: ["mp4"] },
      vars: {},
    };
    expect(JobSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("requires output.name and at least one format", () => {
    const spec = {
      template: "x",
      app: "craftlee",
      aspect: "9:16",
      output: { name: "", formats: [] },
      vars: {},
    };
    expect(JobSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("parseJobSpec throws on invalid input with helpful message", () => {
    expect(() => parseJobSpec({ foo: "bar" })).toThrow(/JobSpec/);
  });

  it("infers JobSpec type", () => {
    const spec: JobSpec = {
      template: "shayari-reel",
      app: "reelvoice",
      aspect: "1:1",
      output: { name: "x", formats: ["mp4", "png"] },
      vars: { shayariLines: ["a"] },
    };
    expect(spec.app).toBe("reelvoice");
  });
});
