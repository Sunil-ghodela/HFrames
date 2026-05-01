export interface BrandSwatch {
  hex: string;
  token: string;
}

export interface ColorInputProps {
  value: string;
  brandSwatches: Record<string, BrandSwatch>;
  onChange: (next: string) => void;
}

export function ColorInput({ value, brandSwatches, onChange }: ColorInputProps) {
  const isToken = typeof value === "string" && value.startsWith("@brand/");
  const resolvedHex = isToken
    ? (Object.values(brandSwatches).find((s) => s.token === value)?.hex ?? "#000000")
    : value || "#000000";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        aria-label="color picker"
        type="color"
        value={resolvedHex.toLowerCase()}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={{ display: "flex", gap: 4 }}>
        {Object.entries(brandSwatches).map(([name, s]) => (
          <button
            key={name}
            type="button"
            aria-label={`brand swatch ${name}`}
            onClick={() => onChange(s.token)}
            title={s.token}
            style={{
              width: 22,
              height: 22,
              background: s.hex,
              border: value === s.token ? "2px solid #6366f1" : "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          />
        ))}
      </div>
      <code style={{ fontSize: 11, color: "#666" }}>{value}</code>
    </div>
  );
}
