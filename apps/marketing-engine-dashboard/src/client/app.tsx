import { useEffect, useMemo, useState } from "react";
import { api, subscribeToRender } from "./api.ts";
import { Header } from "./header.tsx";
import { SlotEditor } from "./slot-editor/index.tsx";
import { RenderResult } from "./result/render-result.tsx";
import { IframeHost } from "./preview/iframe-host.tsx";
import type { BrandSwatch } from "./slot-editor/widgets/color-input.tsx";
import { validateSlots } from "./slot-editor/validate.ts";
import type {
  TemplateListItem,
  AspectRatio,
  RenderProgress,
  BrandJSON,
  AssetEntry,
} from "../shared/types.ts";

const BRAND_NAME = "craftlee";

export function App() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const [slots, setSlots] = useState<Record<string, unknown>>({});
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [renderResult, setRenderResult] = useState<{ jobId: string; outputFile: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<BrandJSON | null>(null);
  const [assets, setAssets] = useState<AssetEntry[]>([]);

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

    api
      .getBrand(BRAND_NAME)
      .then(setBrand)
      .catch(() => undefined);
    api
      .getAssets()
      .then(setAssets)
      .catch(() => undefined);
  }, []);

  const brandSwatches = useMemo<Record<string, BrandSwatch>>(() => {
    if (!brand) return {};
    const out: Record<string, BrandSwatch> = {};
    for (const [name, hex] of Object.entries(brand.colors)) {
      out[name] = { hex, token: `@brand/${BRAND_NAME}-${name}` };
    }
    return out;
  }, [brand]);

  const validation = useMemo(
    () =>
      selected
        ? validateSlots(selected.schema, slots)
        : ({ valid: true, errors: {} } as ReturnType<typeof validateSlots>),
    [selected, slots],
  );

  async function onRender() {
    if (!selected || !validation.valid) return;
    setRendering(true);
    setError(null);
    setProgress(null);
    try {
      const { jobId } = await api.startRender({
        template: selected.schema.name,
        app: BRAND_NAME,
        aspect,
        vars: slots,
        output: { name: `dashboard-${Date.now()}`, formats: ["mp4"] },
      });

      const cleanup = subscribeToRender(jobId, (ev) => {
        if (ev.type === "progress") {
          setProgress(ev.data);
        } else if (ev.type === "done") {
          setRenderResult({ jobId, outputFile: ev.data.outputFile });
          setRendering(false);
          setProgress(null);
          cleanup();
        } else if (ev.type === "error") {
          setError(ev.data.message);
          setRendering(false);
          setProgress(null);
          cleanup();
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRendering(false);
      setProgress(null);
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
        rendering={rendering || !validation.valid}
        progress={progress}
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
            <SlotEditor
              schema={selected.schema}
              value={slots}
              onChange={setSlots}
              brandSwatches={brandSwatches}
              brandImageTokens={[]}
              assets={assets}
              errors={validation.errors}
            />
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
              brandName={BRAND_NAME}
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
