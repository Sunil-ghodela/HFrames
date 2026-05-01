import { useEffect, useRef, useState } from "react";
import type { BrandJSON, TemplateSchema, AspectRatio } from "../../shared/types.ts";

export interface IframeHostProps {
  templateName: string;
  brandName: string;
  schema: TemplateSchema;
  vars: Record<string, unknown>;
  aspect: AspectRatio;
  duration?: number;
}

interface RuntimeMessage {
  type: "ready" | "duration" | "error";
  value?: number;
  message?: string;
  stage?: string;
}

export function IframeHost(props: IframeHostProps) {
  const { templateName, brandName, schema, vars, aspect, duration } = props;
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchdogRef = useRef<number | null>(null);

  // Load template HTML + brand JSON, then post 'load' to iframe.
  useEffect(() => {
    setReady(false);
    setError(null);

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as RuntimeMessage | null;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready") {
        setReady(true);
        if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
      } else if (msg.type === "error") {
        setError(msg.message ?? "preview error");
      }
    };
    window.addEventListener("message", onMessage);

    let cancelled = false;
    (async () => {
      const [htmlRes, brandRes] = await Promise.all([
        fetch(`/api/templates/${encodeURIComponent(templateName)}/html`),
        fetch(`/api/brand/${encodeURIComponent(brandName)}`),
      ]);
      if (!htmlRes.ok || !brandRes.ok) {
        setError("failed to load template/brand");
        return;
      }
      const templateHtml = await htmlRes.text();
      const brand = (await brandRes.json()) as BrandJSON;
      if (cancelled) return;

      const post = () => {
        ref.current?.contentWindow?.postMessage(
          { type: "load", templateHtml, schema, brand, brandName, vars, aspect, duration },
          "*",
        );
      };
      if (ref.current?.contentDocument?.readyState === "complete") post();
      else ref.current?.addEventListener("load", post, { once: true });
    })();

    watchdogRef.current = window.setTimeout(() => {
      setError((prev) => prev ?? "Preview failed to start (5s watchdog)");
    }, 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    };
    // Re-run only on identity changes; vars updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName, brandName, aspect]);

  // Push debounced updates on vars change
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      ref.current?.contentWindow?.postMessage({ type: "hydrate", vars }, "*");
    }, 80);
    return () => window.clearTimeout(id);
  }, [vars, ready]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <iframe
        ref={ref}
        src="/src/client/preview/runtime.html"
        style={{ width: "100%", height: "100%", border: "none", background: "white" }}
        title="preview"
      />
      {error && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            padding: 8,
            background: "#fee",
            color: "#900",
            fontSize: 12,
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => {
              setError(null);
              ref.current?.contentWindow?.location.reload();
            }}
            style={{ marginLeft: 8 }}
          >
            Reload preview
          </button>
        </div>
      )}
    </div>
  );
}
