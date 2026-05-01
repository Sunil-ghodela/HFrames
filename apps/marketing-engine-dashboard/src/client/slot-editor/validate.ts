import type { TemplateSchema } from "../../shared/types.ts";

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateSlots(
  schema: TemplateSchema,
  values: Record<string, unknown>,
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [key, slot] of Object.entries(schema.slots)) {
    const v = values[key];

    if (slot.required && (v == null || v === "" || (Array.isArray(v) && v.length === 0))) {
      errors[key] = "required";
      continue;
    }
    if (v == null || v === "") continue;

    if (slot.type === "string[]") {
      if (!Array.isArray(v)) {
        errors[key] = "must be a list";
      } else {
        if (slot.min != null && v.length < (slot.min as number)) {
          errors[key] = `at least ${slot.min} items`;
        }
        if (slot.max != null && v.length > (slot.max as number)) {
          errors[key] = `at most ${slot.max} items`;
        }
      }
    } else if (slot.type === "color") {
      if (typeof v !== "string") {
        errors[key] = "must be a string";
      } else if (!v.startsWith("@brand/") && !/^#[0-9a-fA-F]{3,8}$/.test(v)) {
        errors[key] = "must be a #hex color or a @brand/ token";
      }
    } else if (slot.type === "asset") {
      if (typeof v !== "string") {
        errors[key] = "must be a string";
      } else if (
        !v.startsWith("@asset/") &&
        !v.startsWith("@brand/") &&
        !v.startsWith("/") &&
        !v.startsWith("http")
      ) {
        errors[key] = "must be a path or a token";
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
