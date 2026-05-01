import type {
  TemplateListItem,
  RenderRequest,
  RenderJobAccepted,
  BrandJSON,
  AssetEntry,
  RenderEvent,
} from "../shared/types.ts";

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async getTemplates(): Promise<TemplateListItem[]> {
    return jsonFetch("/api/templates");
  },
  async getBrand(name: string): Promise<BrandJSON> {
    return jsonFetch(`/api/brand/${encodeURIComponent(name)}`);
  },
  async getAssets(): Promise<AssetEntry[]> {
    return jsonFetch("/api/assets");
  },
  async startRender(
    req: RenderRequest,
  ): Promise<RenderJobAccepted & { outputFile?: string; durationMs?: number }> {
    return jsonFetch("/api/renders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  },
  async openFolder(file: string): Promise<void> {
    await jsonFetch("/api/open-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file }),
    });
  },
  renderFileUrl(jobId: string): string {
    return `/api/renders/${encodeURIComponent(jobId)}/file`;
  },
};

export function subscribeToRender(jobId: string, onEvent: (ev: RenderEvent) => void): () => void {
  const es = new EventSource(`/api/renders/${encodeURIComponent(jobId)}/events`);
  let closed = false;
  let gotTerminal = false;

  const close = () => {
    if (closed) return;
    closed = true;
    es.close();
  };

  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data) as RenderEvent;
      if (ev.type === "done" || ev.type === "error") gotTerminal = true;
      onEvent(ev);
    } catch {
      // ignore malformed
    }
  };
  es.onerror = () => {
    // Network/proxy disconnect before server emitted a terminal event.
    // Surface as a synthetic 'error' so the UI can reset its rendering
    // state instead of getting stuck on "Rendering..." forever.
    if (!gotTerminal) {
      onEvent({
        type: "error",
        data: { message: "lost connection to render progress stream" },
      });
    }
    close();
  };

  return close;
}
