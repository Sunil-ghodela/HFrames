export interface StringListInputProps {
  value: string[];
  min: number;
  max: number;
  onChange: (next: string[]) => void;
}

export function StringListInput({ value, min, max, onChange }: StringListInputProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {value.map((v, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} style={{ display: "flex", gap: 4 }}>
          <input
            type="text"
            value={v}
            onChange={(e) => {
              const next = value.slice();
              next[i] = e.target.value;
              onChange(next);
            }}
            style={{
              flex: 1,
              padding: 6,
              fontSize: 13,
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
          <button
            type="button"
            aria-label={`remove line ${i + 1}`}
            disabled={value.length <= min}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            style={{ padding: "0 8px" }}
          >
            −
          </button>
        </div>
      ))}
      <button
        type="button"
        aria-label="add line"
        disabled={value.length >= max}
        onClick={() => onChange([...value, ""])}
        style={{ alignSelf: "flex-start", padding: "2px 10px", fontSize: 11 }}
      >
        + line
      </button>
      <span style={{ fontSize: 10, color: "#666" }}>
        {value.length} / {max} (min {min})
      </span>
    </div>
  );
}
