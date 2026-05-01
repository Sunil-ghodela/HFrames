import type {
  TemplateListItem,
  RenderRequest,
  RenderJobAccepted,
  BrandJSON,
  AssetEntry,
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
