import { useEffect, useMemo, useState } from "react";
import { api } from "./api.ts";
import { Header } from "./header.tsx";
import { SlotEditor } from "./slot-editor/index.tsx";
import { RenderResult } from "./result/render-result.tsx";
import { IframeHost } from "./preview/iframe-host.tsx";
import type { TemplateListItem, AspectRatio } from "../shared/types.ts";

export function App() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const [slots, setSlots] = useState<Record<string, unknown>>({});
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<{ jobId: string; outputFile: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => templates.find((t) => t.schema.name === selectedName),
    [templates, selectedName],
  );

  useEffect(() => {
    api
      .getTemplates()
      .then((list) => {
        setTemplates(list);
        if (list[0]) {
          setSelectedName(list[0].schema.name);
          const init: Record<string, unknown> = {};
          for (const [key, slot] of Object.entries(list[0].schema.slots)) {
            if ("default" in slot && slot.default !== undefined) init[key] = slot.default;
          }
          setSlots(init);
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function onRender() {
    if (!selected) return;
    setRendering(true);
    setError(null);
    try {
      const res = await api.startRender({
        template: selected.schema.name,
        app: "craftlee",
        aspect,
        vars: slots,
        output: { name: `dashboard-${Date.now()}`, formats: ["mp4"] },
      });
      if (res.outputFile) setRenderResult({ jobId: res.jobId, outputFile: res.outputFile });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRendering(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Header
        templates={templates}
        selectedTemplate={selectedName}
        onSelectTemplate={(n) => {
          setSelectedName(n);
          setSlots({});
          setRenderResult(null);
        }}
        aspect={aspect}
        supportedAspects={(selected?.schema.supportedAspects ?? ["9:16"]) as AspectRatio[]}
        onSelectAspect={setAspect}
        onRender={onRender}
        rendering={rendering}
      />

      {error && <div style={{ padding: 8, background: "#fee", color: "#900" }}>{error}</div>}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div
          style={{
            flex: 1.2,
            padding: 16,
            overflow: "auto",
            borderRight: "1px solid #e5e7eb",
          }}
        >
          {selected ? (
            <SlotEditor schema={selected.schema} value={slots} onChange={setSlots} />
          ) : (
            <p>Loading templates…</p>
          )}
        </div>
        <div
          style={{
            flex: 1,
            padding: 16,
            background: "#fafafa",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {renderResult ? (
            <RenderResult
              jobId={renderResult.jobId}
              outputFile={renderResult.outputFile}
              onRenderAgain={() => setRenderResult(null)}
            />
          ) : selected ? (
            <IframeHost
              templateName={selected.schema.name}
              brandName="craftlee"
              schema={selected.schema}
              vars={slots}
              aspect={aspect}
            />
          ) : (
            <p style={{ color: "#666" }}>Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
