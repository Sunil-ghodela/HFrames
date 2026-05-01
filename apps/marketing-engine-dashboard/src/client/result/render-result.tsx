export interface RenderResultProps {
  jobId: string;
  outputFile: string;
  onRenderAgain: () => void;
}

export function RenderResult({ jobId, outputFile, onRenderAgain }: RenderResultProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <video
        controls
        src={`/api/renders/${encodeURIComponent(jobId)}/file`}
        style={{ maxHeight: 480 }}
      />
      <div style={{ fontSize: 11, color: "#666" }}>{outputFile}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onRenderAgain}>
          Render again
        </button>
      </div>
    </div>
  );
}
