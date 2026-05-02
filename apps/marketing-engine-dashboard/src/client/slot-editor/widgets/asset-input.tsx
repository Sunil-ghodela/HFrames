import type { AssetEntry } from "../../../shared/types.ts";

export interface AssetInputProps {
  kind: "image" | "audio" | "video";
  value: string;
  assets: AssetEntry[];
  brandTokens: { token: string; hex?: string; label: string }[];
  onChange: (next: string) => void;
}

export function AssetInput(props: AssetInputProps) {
  const filtered = props.assets.filter((a) => a.kind === props.kind);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {filtered.map((a) => (
          <img
            key={a.name}
            alt={a.name}
            src={`/api/reels/assets/file?name=${encodeURIComponent(a.name)}`}
            onClick={() => props.onChange(`@asset/${a.name}`)}
            style={{
              width: 56,
              height: 56,
              objectFit: "cover",
              border: props.value === `@asset/${a.name}` ? "2px solid #6366f1" : "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          />
        ))}
      </div>
      {props.brandTokens.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {props.brandTokens.map((b) => (
            <button
              key={b.token}
              type="button"
              onClick={() => props.onChange(b.token)}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                background: b.hex ?? "#eee",
                color: b.hex ? "white" : "#333",
                border: props.value === b.token ? "2px solid #6366f1" : "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      <code style={{ fontSize: 11, color: "#666", display: "block", marginTop: 4 }}>
        {props.value || "(empty)"}
      </code>
    </div>
  );
}
