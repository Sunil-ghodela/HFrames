import type {
  TemplateListItem,
  RenderRequest,
  RenderJobAccepted,
  BrandJSON,
  AssetEntry,
  RenderEvent,
  RenderProgressPhase,
} from "../shared/types.ts";

function authHeaders(): Record<string, string> {
  const raw = localStorage.getItem("jwt");
  if (!raw) return {};
  const token = raw.replace(/\s/g, "");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async getTemplates(): Promise<TemplateListItem[]> {
    return jsonFetch("/api/reels/templates/");
  },
  async getBrand(name: string): Promise<BrandJSON> {
    return jsonFetch(`/api/reels/brands/${encodeURIComponent(name)}/`);
  },
  async getAssets(): Promise<AssetEntry[]> {
    return jsonFetch("/api/reels/assets/");
  },
  async startRender(req: RenderRequest): Promise<RenderJobAccepted> {
    const body = await jsonFetch<{ id: number }>("/api/reels/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec_json: req }),
    });
    return { jobId: String(body.id) };
  },
  renderFileUrl(jobId: string): string {
    return `/api/reels/${encodeURIComponent(jobId)}/file/`;
  },
};

export function subscribeToRender(jobId: string, onEvent: (ev: RenderEvent) => void): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const job = await jsonFetch<{
        status: string;
        phase: string;
        progress: number;
        video_url: string;
        duration_ms: number;
        error: string;
      }>(`/api/reels/${encodeURIComponent(jobId)}/`);

      if (job.status === "running" || job.status === "queued") {
        onEvent({
          type: "progress",
          data: { phase: job.phase as RenderProgressPhase, progress: job.progress },
        });
      } else if (job.status === "done") {
        onEvent({
          type: "done",
          data: { outputFile: job.video_url, durationMs: job.duration_ms },
        });
        stopped = true;
        return;
      } else if (job.status === "failed" || job.status === "cancelled") {
        onEvent({
          type: "error",
          data: { message: job.error || `job ${job.status}` },
        });
        stopped = true;
        return;
      }
    } catch {
      // transient — just retry
    }
    if (!stopped) setTimeout(tick, 2000);
  };
  void tick();
  return () => {
    stopped = true;
  };
}
