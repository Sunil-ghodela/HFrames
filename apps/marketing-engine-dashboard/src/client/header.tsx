import type { TemplateListItem, AspectRatio, RenderProgress } from "../shared/types.ts";

export interface HeaderProps {
  templates: TemplateListItem[];
  selectedTemplate: string;
  onSelectTemplate: (name: string) => void;
  aspect: AspectRatio;
  supportedAspects: AspectRatio[];
  onSelectAspect: (a: AspectRatio) => void;
  onRender: () => void;
  rendering: boolean;
  progress?: RenderProgress | null;
}

export function Header(props: HeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        borderBottom: "1px solid #e5e7eb",
        background: "#fafafa",
      }}
    >
      <strong style={{ fontSize: 14 }}>marketing-engine-dashboard</strong>

      <select
        aria-label="Template"
        value={props.selectedTemplate}
        onChange={(e) => props.onSelectTemplate(e.target.value)}
      >
        {props.templates.map((t) => (
          <option key={t.schema.name} value={t.schema.name}>
            {t.schema.name}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 4 }}>
        {props.supportedAspects.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => props.onSelectAspect(a)}
            style={{
              padding: "2px 8px",
              fontSize: 12,
              background: props.aspect === a ? "#6366f1" : "#eee",
              color: props.aspect === a ? "white" : "#333",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {a}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {props.progress && (
        <span style={{ fontSize: 11, color: "#666" }}>
          {props.progress.phase} {Math.round(props.progress.progress * 100)}%
        </span>
      )}

      <button
        type="button"
        onClick={props.onRender}
        disabled={props.rendering}
        style={{
          padding: "6px 14px",
          background: props.rendering ? "#999" : "#6366f1",
          color: "white",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: props.rendering ? "wait" : "pointer",
        }}
      >
        {props.rendering ? "Rendering…" : "Render MP4"}
      </button>
    </div>
  );
}
