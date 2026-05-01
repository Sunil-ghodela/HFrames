import type { TemplateSchema, AssetEntry } from "../../shared/types.ts";
import { ColorInput, type BrandSwatch } from "./widgets/color-input.tsx";
import { AssetInput } from "./widgets/asset-input.tsx";
import { StringListInput } from "./widgets/string-list-input.tsx";

export interface SlotEditorProps {
  schema: TemplateSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  brandSwatches?: Record<string, BrandSwatch>;
  brandImageTokens?: { token: string; hex?: string; label: string }[];
  assets?: AssetEntry[];
  errors?: Record<string, string>;
}

export function SlotEditor({
  schema,
  value,
  onChange,
  brandSwatches = {},
  brandImageTokens = [],
  assets = [],
  errors = {},
}: SlotEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Object.entries(schema.slots).map(([key, slot]) => {
        const err = errors[key];
        return (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor={`slot-${key}`} style={{ fontSize: 12, fontWeight: 600 }}>
              {key}
              {slot.required ? " *" : ""}
            </label>
            <div id={`slot-${key}`}>
              {slot.type === "color" ? (
                <ColorInput
                  value={String(value[key] ?? slot.default ?? "#000000")}
                  brandSwatches={brandSwatches}
                  onChange={(v) => onChange({ ...value, [key]: v })}
                />
              ) : slot.type === "asset" ? (
                <AssetInput
                  kind={(slot.kind as "image" | "audio" | "video" | undefined) ?? "image"}
                  value={String(value[key] ?? slot.default ?? "")}
                  assets={assets}
                  brandTokens={brandImageTokens}
                  onChange={(v) => onChange({ ...value, [key]: v })}
                />
              ) : slot.type === "string[]" ? (
                <StringListInput
                  value={(value[key] as string[] | undefined) ?? []}
                  min={(slot.min as number | undefined) ?? 0}
                  max={(slot.max as number | undefined) ?? 99}
                  onChange={(v) => onChange({ ...value, [key]: v })}
                />
              ) : (
                <input
                  type="text"
                  value={formatValue(value[key])}
                  onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                  placeholder={slot.description}
                  style={{
                    padding: 6,
                    fontSize: 13,
                    border: err ? "1px solid #c00" : "1px solid #ccc",
                    borderRadius: 4,
                    width: "100%",
                  }}
                />
              )}
            </div>
            {err && <span style={{ fontSize: 11, color: "#c00" }}>{err}</span>}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}
