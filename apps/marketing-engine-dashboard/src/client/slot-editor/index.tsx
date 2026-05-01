import type { TemplateSchema } from "../../shared/types.ts";

export interface SlotEditorProps {
  schema: TemplateSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function SlotEditor({ schema, value, onChange }: SlotEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Object.entries(schema.slots).map(([key, slot]) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor={`slot-${key}`} style={{ fontSize: 12, fontWeight: 600 }}>
            {key}
            {slot.required ? " *" : ""}
          </label>
          <input
            id={`slot-${key}`}
            type="text"
            value={formatValue(value[key])}
            onChange={(e) => onChange({ ...value, [key]: parseValue(e.target.value, slot.type) })}
            placeholder={slot.description}
            style={{ padding: 6, fontSize: 13, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>
      ))}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}

function parseValue(raw: string, type: string): unknown {
  if (type === "string[]") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.split(",").map((s) => s.trim());
    }
  }
  return raw;
}
