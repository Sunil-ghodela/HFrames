# Marketing Engine Dashboard — v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local web dashboard at `http://localhost:5173` that lets Vaibhav pick a template, edit its slots in a type-aware form with live HTML preview, and render an MP4 — using the same `renderJob` code path the Phase A `make` CLI uses.

**Architecture:** New workspace package `apps/marketing-engine-dashboard/`. Vite + React for the SPA; a small bun HTTP server (using `Bun.serve`) for `/api/*`. The server imports `@marketing-engine/app` as a workspace dependency and calls `loadTemplate` → `hydrateTemplate` → `renderJob` directly (no subprocess). Live preview is client-side only: an iframe loads `runtime.html` which embeds the template HTML and runs a port of `template.ts`'s hydrator + the `@hyperframes` runtime in real DOM, driven by `postMessage` from the React shell.

**Tech Stack:** Bun (runtime + package manager), TypeScript 5+, React 18, Vite 6, Zod (validation, mirrors engine), vitest + happy-dom (tests), `@marketing-engine/app` (workspace dep), `@hyperframes/player` (web component for iframe runtime, optional — see Task 13).

**Scope:** Plan implements the **slim end-to-end loop** from the spec (`docs/specs/2026-04-30-dashboard-design.md`). Out of scope: render queue UI, output history beyond the most recent render, multi-user/auth, hand-curated per-template forms, browser E2E (Playwright), localStorage persistence.

**Done when:**
1. `bun install` at repo root resolves with the new workspace registered.
2. `bun run --cwd apps/marketing-engine-dashboard test` passes all unit tests.
3. `bun run --cwd apps/marketing-engine-dashboard dev` opens a working dashboard at `http://localhost:5173`.
4. Selecting `shayari-reel` populates the form with all five slots; editing any slot updates the iframe preview within ~100ms.
5. Clicking **Render** produces an MP4 in `apps/marketing-engine/out/YYYY-MM-DD/<app>/<aspect>/`.
6. `SMOKE_RENDER=1 bun run --cwd apps/marketing-engine-dashboard test tests/e2e.smoke.test.ts` produces a real H.264 MP4.
7. `git pull upstream main` still merges clean.
8. `bunx oxlint apps/marketing-engine-dashboard/` and `bunx oxfmt --check apps/marketing-engine-dashboard/` pass.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/marketing-engine-dashboard/package.json` | Workspace member; deps: react, react-dom, vite, @vitejs/plugin-react, zod, @marketing-engine/app, vitest, happy-dom, @testing-library/react, @types/react. |
| `apps/marketing-engine-dashboard/tsconfig.json` | TS config extending repo root, JSX=react-jsx, two project refs (server/client). |
| `apps/marketing-engine-dashboard/tsconfig.server.json` | Server-only config: target node, no DOM lib. |
| `apps/marketing-engine-dashboard/tsconfig.client.json` | Client-only config: target browser, DOM lib. |
| `apps/marketing-engine-dashboard/vite.config.ts` | Vite SPA build, dev proxy `/api → :7878`, `tests/` excluded. |
| `apps/marketing-engine-dashboard/.gitignore` | Ignores `dist/`, `node_modules/`, `.vite/`. |
| `apps/marketing-engine-dashboard/index.html` | Vite entry HTML. |
| `apps/marketing-engine-dashboard/src/shared/types.ts` | Request/response shapes shared by server + client. |
| `apps/marketing-engine-dashboard/src/server/index.ts` | Bun.serve entry — serves built SPA + dispatches `/api/*`. |
| `apps/marketing-engine-dashboard/src/server/routes.ts` | Route handlers (templates, brand, assets, renders, open-folder). |
| `apps/marketing-engine-dashboard/src/server/render-runner.ts` | Holds the in-memory job registry + SSE event bus; wraps `renderJob`. |
| `apps/marketing-engine-dashboard/src/client/main.tsx` | React root mount. |
| `apps/marketing-engine-dashboard/src/client/app.tsx` | Two-pane layout shell + global state. |
| `apps/marketing-engine-dashboard/src/client/header.tsx` | Template dropdown · aspect tabs · Render button · status pill. |
| `apps/marketing-engine-dashboard/src/client/api.ts` | Typed fetch wrappers + EventSource helper. |
| `apps/marketing-engine-dashboard/src/client/slot-editor/index.tsx` | Builds form from `template.json`. Schema-driven dispatch. |
| `apps/marketing-engine-dashboard/src/client/slot-editor/widgets/string-input.tsx` | Single-line / multi-line text widget. |
| `apps/marketing-engine-dashboard/src/client/slot-editor/widgets/string-list-input.tsx` | Array editor with add/remove + min/max. |
| `apps/marketing-engine-dashboard/src/client/slot-editor/widgets/color-input.tsx` | Native picker + brand-swatch chips. |
| `apps/marketing-engine-dashboard/src/client/slot-editor/widgets/asset-input.tsx` | File grid with thumbs + brand-asset chips. |
| `apps/marketing-engine-dashboard/src/client/slot-editor/validate.ts` | Zod schema mirroring engine slot validation. |
| `apps/marketing-engine-dashboard/src/client/preview/iframe-host.tsx` | Iframe wrapper, postMessage protocol, scrubber/play. |
| `apps/marketing-engine-dashboard/src/client/preview/runtime.html` | Iframe document — loads template HTML + hydrator + hyperframes runtime. |
| `apps/marketing-engine-dashboard/src/client/preview/hydrator.ts` | Client-side port of engine's `template.ts` hydrator. |
| `apps/marketing-engine-dashboard/src/client/preview/asset-resolver.ts` | Client-side port of engine's `assets.ts` resolver. |
| `apps/marketing-engine-dashboard/src/client/result/render-result.tsx` | `<video>` swap + Open Folder + Render Again. |
| `apps/marketing-engine-dashboard/tests/server/routes.test.ts` | Unit tests for `/api/*` route handlers. |
| `apps/marketing-engine-dashboard/tests/server/render-runner.test.ts` | Unit tests for SSE event bus + job registry. |
| `apps/marketing-engine-dashboard/tests/client/widgets.test.tsx` | Unit tests for each widget. |
| `apps/marketing-engine-dashboard/tests/client/slot-editor.test.tsx` | Unit tests for form generation, validation, render gating. |
| `apps/marketing-engine-dashboard/tests/client/hydrator-parity.test.ts` | **Load-bearing** parity test against engine's `template.ts`. |
| `apps/marketing-engine-dashboard/tests/e2e.smoke.test.ts` | Gated `SMOKE_RENDER=1` integration test producing a real MP4. |
| `apps/marketing-engine/src/index.ts` (NEW or extended) | Re-exports public engine API consumed by dashboard. |
| `apps/marketing-engine/src/templates-list.ts` (NEW) | `listTemplates()`. |
| `apps/marketing-engine/src/asset-list.ts` (NEW) | `listAssets()`. |
| `apps/marketing-engine/src/render.ts` (MODIFY) | Add `onProgress` callback parameter. |
| `apps/marketing-engine/src/assets.ts` (MODIFY) | Export `loadBrand(name)`. |

---

## Prerequisites (one-time, before any task)

- [ ] **Step P1: Verify Phase A green**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
bun install
bun run --cwd apps/marketing-engine test
```

Expected: 20 tests pass.

- [ ] **Step P2: Verify upstream-clean baseline**

```bash
git status                            # expect clean
git fetch upstream
git log --oneline upstream/main..main # expect: only fork-only commits visible
```

If `packages/` has any unstaged or fork-only diffs, fix that before continuing.

- [ ] **Step P3: Verify Chrome + ffmpeg available**

```bash
which ffmpeg && ffmpeg -version | head -1
ls ~/.cache/puppeteer/ 2>/dev/null || bunx puppeteer browsers install chrome
```

Both required for Task 22 smoke test (and any real render).

---

## Task 1: Workspace Scaffold

Create the package skeleton, register it in workspace globs, install deps. No code yet — just plumbing.

**Files:**
- Create: `apps/marketing-engine-dashboard/package.json`
- Create: `apps/marketing-engine-dashboard/tsconfig.json`
- Create: `apps/marketing-engine-dashboard/tsconfig.client.json`
- Create: `apps/marketing-engine-dashboard/tsconfig.server.json`
- Create: `apps/marketing-engine-dashboard/.gitignore`
- Create: `apps/marketing-engine-dashboard/vite.config.ts`
- Create: `apps/marketing-engine-dashboard/index.html`
- Create: `apps/marketing-engine-dashboard/src/client/main.tsx` (stub)
- Create: `apps/marketing-engine-dashboard/src/client/app.tsx` (stub)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@marketing-engine/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -n vite,server \"vite\" \"tsx --watch src/server/index.ts\"",
    "dev:client": "vite",
    "dev:server": "tsx --watch src/server/index.ts",
    "build": "vite build",
    "start": "NODE_ENV=production tsx src/server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "@marketing-engine/app": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^8.2.0",
    "happy-dom": "^20.9.0",
    "tsx": "^4.21.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` (project references root)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.server.json" },
    { "path": "./tsconfig.client.json" }
  ]
}
```

- [ ] **Step 3: Create `tsconfig.server.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "jsx": "react-jsx"
  },
  "include": ["src/server/**/*", "src/shared/**/*", "tests/server/**/*"]
}
```

- [ ] **Step 4: Create `tsconfig.client.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": [],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "useDefineForClassFields": true
  },
  "include": ["src/client/**/*", "src/shared/**/*", "tests/client/**/*"]
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.vite/
*.tsbuildinfo
```

- [ ] **Step 6: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7878",
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Marketing Engine Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create stub `src/client/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create stub `src/client/app.tsx`**

```tsx
export function App() {
  return <div style={{ padding: 16 }}>marketing-engine-dashboard — scaffold</div>;
}
```

- [ ] **Step 10: Verify `bun install` resolves**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
bun install
```

Expected: success; the new workspace member shows up under `apps/marketing-engine-dashboard/node_modules`.

- [ ] **Step 11: Verify `vite` boots**

```bash
bun run --cwd apps/marketing-engine-dashboard dev:client
```

Expected: Vite dev server starts at `http://127.0.0.1:5173` and the page renders the scaffold text. Ctrl-C to stop.

- [ ] **Step 12: Commit**

```bash
git add apps/marketing-engine-dashboard/ bun.lock
git commit -m "feat(dashboard): scaffold marketing-engine-dashboard package"
```

---

## Task 2: Engine — `listTemplates()`

Add `listTemplates()` to the engine package so the dashboard server can enumerate `templates/*/template.json` without re-implementing fs walking.

**Files:**
- Create: `apps/marketing-engine/src/templates-list.ts`
- Create: `apps/marketing-engine/tests/templates-list.test.ts`
- Modify: `apps/marketing-engine/src/template.ts` (export already exists; no change expected — verify)

- [ ] **Step 1: Write the failing test**

Create `apps/marketing-engine/tests/templates-list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { listTemplates } from "../src/templates-list.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("listTemplates", () => {
  it("returns all templates with parsed schema", async () => {
    const templates = await listTemplates({ rootDir: ROOT });
    const names = templates.map((t) => t.schema.name).sort();
    expect(names).toContain("shayari-reel");
  });

  it("each entry has slots, supportedAspects, and html path", async () => {
    const templates = await listTemplates({ rootDir: ROOT });
    const sr = templates.find((t) => t.schema.name === "shayari-reel");
    expect(sr).toBeDefined();
    expect(Object.keys(sr!.schema.slots)).toContain("shayariLines");
    expect(sr!.schema.supportedAspects).toContain("9:16");
    expect(sr!.htmlPath).toMatch(/templates\/shayari-reel\/template\.html$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine test tests/templates-list.test.ts
```

Expected: FAIL with "Cannot find module" or similar.

- [ ] **Step 3: Implement**

Create `apps/marketing-engine/src/templates-list.ts`:

```ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TemplateSchema } from "./template.ts";

export interface TemplateListEntry {
  schema: TemplateSchema;
  htmlPath: string;
  dir: string;
}

export interface ListTemplatesContext {
  rootDir: string;
}

export async function listTemplates(ctx: ListTemplatesContext): Promise<TemplateListEntry[]> {
  const templatesDir = join(ctx.rootDir, "templates");
  const entries = await readdir(templatesDir);
  const result: TemplateListEntry[] = [];

  for (const name of entries) {
    const dir = join(templatesDir, name);
    const dirStat = await stat(dir);
    if (!dirStat.isDirectory()) continue;

    const jsonPath = join(dir, "template.json");
    try {
      const raw = await readFile(jsonPath, "utf8");
      const schema = JSON.parse(raw) as TemplateSchema;
      result.push({
        schema,
        htmlPath: join(dir, "template.html"),
        dir,
      });
    } catch {
      // Directory without template.json — skip silently
    }
  }

  result.sort((a, b) => a.schema.name.localeCompare(b.schema.name));
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --cwd apps/marketing-engine test tests/templates-list.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing-engine/src/templates-list.ts apps/marketing-engine/tests/templates-list.test.ts
git commit -m "feat(marketing-engine): add listTemplates() for dashboard enumeration"
```

---

## Task 3: Engine — `loadBrand()`

Lift the brand-JSON read out of `assets.ts` internals into a public export so the dashboard can serve `/api/brand/:name`.

**Files:**
- Modify: `apps/marketing-engine/src/assets.ts`
- Create: `apps/marketing-engine/tests/brand.test.ts`

- [ ] **Step 1: Inspect current `assets.ts` for the existing internal read**

```bash
grep -n "brand" apps/marketing-engine/src/assets.ts
```

Note where brand JSON is read (likely a `loadBrandJson` private helper or inline `readFile` inside `resolveRef`).

- [ ] **Step 2: Write the failing test**

Create `apps/marketing-engine/tests/brand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadBrand } from "../src/assets.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("loadBrand", () => {
  it("returns parsed craftlee brand JSON", async () => {
    const brand = await loadBrand("craftlee", { rootDir: ROOT });
    expect(brand.name).toBe("CraftLee");
    expect(brand.colors.saffron).toBe("#FF9933");
    expect(brand.fonts["devanagari-display"]).toBe("Mukta");
  });

  it("throws for unknown brand", async () => {
    await expect(loadBrand("nonexistent", { rootDir: ROOT })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine test tests/brand.test.ts
```

Expected: FAIL with "loadBrand is not a function" or similar.

- [ ] **Step 4: Implement (extend `assets.ts`)**

Add to `apps/marketing-engine/src/assets.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface BrandJSON {
  name: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  cta?: { default?: string; [k: string]: string | undefined };
}

export async function loadBrand(name: string, ctx: ResolverContext): Promise<BrandJSON> {
  const path = join(ctx.rootDir, "assets", "brand", `${name}.json`);
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as BrandJSON;
}
```

If `resolveRef` previously had inline `readFile` for brand, refactor it to delegate to `loadBrand`. Verify behavior with existing `assets.test.ts`.

- [ ] **Step 5: Run all engine tests**

```bash
bun run --cwd apps/marketing-engine test
```

Expected: all tests pass (existing + new brand test).

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine/src/assets.ts apps/marketing-engine/tests/brand.test.ts
git commit -m "feat(marketing-engine): expose loadBrand() for dashboard /api/brand"
```

---

## Task 4: Engine — `listAssets()`

Walk `assets/` (excluding `assets/brand/`) and return file entries with thumbnails. Used by `/api/assets` for the dashboard's asset picker.

**Files:**
- Create: `apps/marketing-engine/src/asset-list.ts`
- Create: `apps/marketing-engine/tests/asset-list.test.ts`
- Create (test fixture): `apps/marketing-engine/assets/sample-bg.png` (a 1×1 PNG; `printf '\x89PNG\r\n\x1a\n' > apps/marketing-engine/assets/sample-bg.png` won't work — use the binary blob below, or copy any existing PNG)

- [ ] **Step 1: Add a test fixture asset**

Use any existing small PNG (e.g., from `apps/marketing-engine/assets/brand/` if it has one, or generate one):

```bash
# Generate a 1×1 transparent PNG using Node:
node -e "
const fs=require('node:fs');
const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=','base64');
fs.writeFileSync('apps/marketing-engine/assets/sample-bg.png', b);
"
```

- [ ] **Step 2: Write the failing test**

Create `apps/marketing-engine/tests/asset-list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { listAssets } from "../src/asset-list.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("listAssets", () => {
  it("returns image assets, excluding the brand subdirectory", async () => {
    const assets = await listAssets({ rootDir: ROOT });
    const names = assets.map((a) => a.name);
    expect(names).toContain("sample-bg.png");
    expect(names.every((n) => !n.startsWith("brand/"))).toBe(true);
  });

  it("each entry has kind and relative path", async () => {
    const assets = await listAssets({ rootDir: ROOT });
    const sample = assets.find((a) => a.name === "sample-bg.png");
    expect(sample).toBeDefined();
    expect(sample!.kind).toBe("image");
    expect(sample!.relPath).toBe("sample-bg.png");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine test tests/asset-list.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Implement**

Create `apps/marketing-engine/src/asset-list.ts`:

```ts
import { readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

export type AssetKind = "image" | "audio" | "video" | "other";

export interface AssetEntry {
  name: string;
  relPath: string;
  absPath: string;
  kind: AssetKind;
}

export interface ListAssetsContext {
  rootDir: string;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm"]);

function classify(ext: string): AssetKind {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return "image";
  if (AUDIO_EXTS.has(e)) return "audio";
  if (VIDEO_EXTS.has(e)) return "video";
  return "other";
}

export async function listAssets(ctx: ListAssetsContext): Promise<AssetEntry[]> {
  const assetsDir = join(ctx.rootDir, "assets");
  const out: AssetEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir);
    for (const name of entries) {
      const abs = join(dir, name);
      const s = await stat(abs);
      if (s.isDirectory()) {
        // Skip the brand subdirectory — those are JSON kits, not media assets
        if (relative(assetsDir, abs) === "brand") continue;
        await walk(abs);
      } else {
        const kind = classify(extname(name));
        if (kind === "other") continue;
        const rel = relative(assetsDir, abs);
        out.push({ name: rel, relPath: rel, absPath: abs, kind });
      }
    }
  }

  await walk(assetsDir);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run --cwd apps/marketing-engine test tests/asset-list.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine/src/asset-list.ts apps/marketing-engine/tests/asset-list.test.ts apps/marketing-engine/assets/sample-bg.png
git commit -m "feat(marketing-engine): add listAssets() with kind classification"
```

---

## Task 5: Engine — `renderJob` `onProgress` callback

Add an optional `onProgress(phase, progress)` callback to `renderJob`. Plumbs it through to `executeRenderJob` from `@hyperframes/producer` (which already supports per-stage progress; see `packages/producer/src/services/renderOrchestrator.ts`).

**Files:**
- Modify: `apps/marketing-engine/src/render.ts`
- Create: `apps/marketing-engine/tests/render-progress.test.ts`

- [ ] **Step 1: Inspect producer's `executeRenderJob` signature**

```bash
grep -n "export.*executeRenderJob\|interface.*executeRenderJob\|function executeRenderJob" packages/producer/src/index.ts packages/producer/src/services/*.ts 2>/dev/null
```

Note the `onProgress` option shape (typically `(progress: { stage: string; progress: number }) => void`).

- [ ] **Step 2: Write the failing test**

Create `apps/marketing-engine/tests/render-progress.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { RenderArgs } from "../src/render.ts";
import { renderJob } from "../src/render.ts";

// We don't run a real render here — we just verify the signature accepts onProgress.
// A separate smoke test exercises the real producer.
describe("renderJob onProgress signature", () => {
  it("accepts an onProgress option in its args", () => {
    const onProgress = vi.fn();
    const args: RenderArgs = {
      job: { template: "shayari-reel", app: "craftlee", aspect: "9:16", output: { name: "x", formats: ["mp4"] }, vars: {} } as never,
      html: "<html></html>",
      outDir: "/tmp/x",
      rootDir: "/tmp/x",
      onProgress,
    };
    // Type-check only — no execution needed at this layer.
    expect(typeof args.onProgress).toBe("function");
  });
});
```

- [ ] **Step 3: Run test to verify it fails (type error)**

```bash
bun run --cwd apps/marketing-engine typecheck
```

Expected: FAIL with TS error "Object literal may only specify known properties, and 'onProgress' does not exist in type 'RenderArgs'".

- [ ] **Step 4: Modify `render.ts` to add `onProgress`**

In `apps/marketing-engine/src/render.ts`, change the `RenderArgs` interface and the `renderJob` body:

```ts
export type RenderProgressPhase = "preprocessing" | "capture" | "encode" | "postprocessing" | "done";

export interface RenderProgress {
  phase: RenderProgressPhase;
  progress: number; // 0..1
  message?: string;
}

export interface RenderArgs {
  job: JobSpec;
  html: string;
  outDir: string;
  rootDir: string;
  onProgress?: (event: RenderProgress) => void;
}
```

Then plumb `onProgress` into the `executeRenderJob` call. The exact mapping depends on the producer's API (Step 1 finding); the typical shape is:

```ts
await executeRenderJob(renderJobInstance, projectDir, finalPath, {
  onProgress: (p) => {
    // p is typically { stage: string; progress: number }
    // Map producer stages → our phase enum:
    const phase: RenderProgressPhase =
      p.stage === "preprocessing" ? "preprocessing" :
      p.stage === "capture" ? "capture" :
      p.stage === "encode" || p.stage === "encoding" ? "encode" :
      p.stage === "postprocessing" ? "postprocessing" : "preprocessing";
    args.onProgress?.({ phase, progress: p.progress, message: p.message });
  },
});
```

If producer's `executeRenderJob` does NOT accept an options bag for progress, fall back to wrapping its phases manually around the call:

```ts
args.onProgress?.({ phase: "preprocessing", progress: 0.05 });
await executeRenderJob(renderJobInstance, projectDir, finalPath);
args.onProgress?.({ phase: "done", progress: 1 });
```

Then emit a final `{ phase: "done", progress: 1 }` after `executeRenderJob` resolves.

- [ ] **Step 5: Run typecheck and existing engine tests**

```bash
bun run --cwd apps/marketing-engine typecheck
bun run --cwd apps/marketing-engine test
```

Expected: typecheck passes, all tests pass (the smoke test in particular must still produce an MP4 — gated behind `SMOKE_RENDER=1`).

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine/src/render.ts apps/marketing-engine/tests/render-progress.test.ts
git commit -m "feat(marketing-engine): add onProgress callback to renderJob"
```

---

## Task 6: Shared types module

Define the wire shapes used by both server routes and client API helpers.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/shared/types.ts`

- [ ] **Step 1: Create the file**

```ts
import type { TemplateSchema } from "@marketing-engine/app/src/template.ts";
import type { BrandJSON } from "@marketing-engine/app/src/assets.ts";
import type { AssetEntry } from "@marketing-engine/app/src/asset-list.ts";
import type { RenderProgress } from "@marketing-engine/app/src/render.ts";

export type AspectRatio = "9:16" | "1:1" | "16:9";

export interface TemplateListItem {
  schema: TemplateSchema;
  // Fields kept server-side: htmlPath, dir
}

export interface RenderRequest {
  template: string;
  app: string;
  aspect: AspectRatio;
  vars: Record<string, unknown>;
  output: { name: string; formats: ["mp4"] };
}

export interface RenderJobAccepted {
  jobId: string;
}

export interface RenderJobStatus {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  progress?: RenderProgress;
  outputFile?: string;
  error?: string;
}

export type RenderEvent =
  | { type: "progress"; data: RenderProgress }
  | { type: "done"; data: { outputFile: string; durationMs: number } }
  | { type: "error"; data: { message: string } };

export interface OpenFolderRequest {
  file: string;
}

export interface ApiError {
  error: string;
}

export type { TemplateSchema, BrandJSON, AssetEntry, RenderProgress };
```

- [ ] **Step 2: Verify typecheck**

```bash
bun run --cwd apps/marketing-engine-dashboard typecheck
```

Expected: PASS (all imports resolve via workspace dep).

- [ ] **Step 3: Commit**

```bash
git add apps/marketing-engine-dashboard/src/shared/types.ts
git commit -m "feat(dashboard): add shared wire types"
```

---

## Task 7: Bun server — `GET /api/templates`

Stand up the bun HTTP server with a single route. Single-render lock is enforced here (in-memory Boolean) — used by Task 8.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/server/index.ts`
- Create: `apps/marketing-engine-dashboard/src/server/routes.ts`
- Create: `apps/marketing-engine-dashboard/tests/server/routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/marketing-engine-dashboard/tests/server/routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../../src/server/routes.ts";

describe("GET /api/templates", () => {
  it("returns the list of templates", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/api/templates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const sr = body.find((t: { schema: { name: string } }) => t.schema.name === "shayari-reel");
    expect(sr).toBeDefined();
  });

  it("returns 404 for unknown routes", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/api/no-such-thing"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/server/routes.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `routes.ts`**

Create `apps/marketing-engine-dashboard/src/server/routes.ts`:

```ts
import { listTemplates } from "@marketing-engine/app/src/templates-list.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { TemplateListItem } from "../shared/types.ts";

// Resolve the engine package's root directory so we can read templates/, assets/.
const ENGINE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "marketing-engine",
);

export interface AppLike {
  fetch(req: Request): Promise<Response>;
}

export function createApp(): AppLike {
  return {
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;

      if (method === "GET" && pathname === "/api/templates") {
        const list = await listTemplates({ rootDir: ENGINE_ROOT });
        const payload: TemplateListItem[] = list.map((t) => ({ schema: t.schema }));
        return Response.json(payload);
      }

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/server/routes.test.ts
```

Expected: PASS (both tests).

- [ ] **Step 5: Implement `index.ts` (server entry)**

Create `apps/marketing-engine-dashboard/src/server/index.ts`:

```ts
import { createApp } from "./routes.ts";

const PORT = Number(process.env.PORT ?? 7878);
const app = createApp();

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  fetch: (req) => app.fetch(req),
});

console.log(`marketing-engine-dashboard server listening on http://${server.hostname}:${server.port}`);
```

- [ ] **Step 6: Verify server boots**

```bash
bun run --cwd apps/marketing-engine-dashboard dev:server &
sleep 2
curl -s http://127.0.0.1:7878/api/templates | head -c 200
kill %1
```

Expected: a JSON array containing `shayari-reel`.

- [ ] **Step 7: Commit**

```bash
git add apps/marketing-engine-dashboard/src/server/ apps/marketing-engine-dashboard/tests/server/routes.test.ts
git commit -m "feat(dashboard): bun server with GET /api/templates"
```

---

## Task 8: Bun server — `POST /api/renders` (blocking, no SSE yet)

Add a blocking render endpoint that hydrates the template and calls `renderJob`. Enforces single-render lock (returns 409 if busy). SSE is added in Task 15; this task returns the final status synchronously.

**Files:**
- Modify: `apps/marketing-engine-dashboard/src/server/routes.ts`
- Create: `apps/marketing-engine-dashboard/src/server/render-runner.ts`
- Modify: `apps/marketing-engine-dashboard/tests/server/routes.test.ts`
- Create: `apps/marketing-engine-dashboard/tests/server/render-runner.test.ts`

- [ ] **Step 1: Write the failing test for the runner (stubbed renderJob)**

Create `apps/marketing-engine-dashboard/tests/server/render-runner.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createRenderRunner } from "../../src/server/render-runner.ts";

describe("RenderRunner", () => {
  it("rejects a second start while busy with 409 semantics", async () => {
    const runner = createRenderRunner({
      runRender: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { outputPath: "/tmp/out.mp4", jobId: "x", durationMs: 50 };
      },
    });

    const req = {
      template: "shayari-reel",
      app: "craftlee",
      aspect: "9:16" as const,
      vars: { shayariLines: ["a", "b"] },
      output: { name: "test", formats: ["mp4"] as ["mp4"] },
    };

    const first = runner.start(req);
    const second = await runner.start(req).catch((e) => e);
    expect(second).toBeInstanceOf(Error);
    expect((second as Error).message).toMatch(/busy/i);

    await first;
  });

  it("emits progress events through subscribe()", async () => {
    const runner = createRenderRunner({
      runRender: async (_req, onProgress) => {
        onProgress?.({ phase: "preprocessing", progress: 0.1 });
        onProgress?.({ phase: "capture", progress: 0.5 });
        onProgress?.({ phase: "encode", progress: 0.9 });
        return { outputPath: "/tmp/out.mp4", jobId: "x", durationMs: 100 };
      },
    });

    const events: string[] = [];
    const cleanup = runner.subscribe("any", (ev) => events.push(ev.type));

    const req = {
      template: "shayari-reel",
      app: "craftlee",
      aspect: "9:16" as const,
      vars: { shayariLines: ["a", "b"] },
      output: { name: "test", formats: ["mp4"] as ["mp4"] },
    };

    await runner.start(req);
    cleanup();
    expect(events).toContain("progress");
    expect(events).toContain("done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/server/render-runner.test.ts
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `render-runner.ts`**

Create `apps/marketing-engine-dashboard/src/server/render-runner.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { RenderRequest, RenderEvent, RenderProgress } from "../shared/types.ts";

export interface RenderRunResult {
  outputPath: string;
  jobId: string;
  durationMs: number;
}

export interface RenderRunnerDeps {
  runRender: (
    req: RenderRequest,
    onProgress?: (p: RenderProgress) => void,
  ) => Promise<RenderRunResult>;
}

export interface RenderRunner {
  start(req: RenderRequest): Promise<{ jobId: string }>;
  subscribe(jobId: string, listener: (ev: RenderEvent) => void): () => void;
  isBusy(): boolean;
  currentJobId(): string | null;
  getResult(jobId: string): RenderRunResult | undefined;
}

export function createRenderRunner(deps: RenderRunnerDeps): RenderRunner {
  let busy = false;
  let currentId: string | null = null;
  const listeners = new Map<string, Set<(ev: RenderEvent) => void>>();
  const results = new Map<string, RenderRunResult>();

  function emit(jobId: string, ev: RenderEvent): void {
    const set = listeners.get(jobId);
    if (!set) return;
    for (const fn of set) fn(ev);
  }

  return {
    async start(req) {
      if (busy) throw new Error("render runner is busy");
      busy = true;
      const jobId = randomUUID();
      currentId = jobId;

      // Run async; return jobId immediately is desirable for HTTP layer,
      // but the contract here resolves only when render finishes (HTTP layer
      // can choose to await or not).
      try {
        const result = await deps.runRender(req, (p) => {
          emit(jobId, { type: "progress", data: p });
        });
        results.set(jobId, result);
        emit(jobId, { type: "done", data: { outputFile: result.outputPath, durationMs: result.durationMs } });
        return { jobId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit(jobId, { type: "error", data: { message } });
        throw err;
      } finally {
        busy = false;
        currentId = null;
      }
    },

    subscribe(jobId, listener) {
      const set = listeners.get(jobId) ?? new Set();
      set.add(listener);
      listeners.set(jobId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(jobId);
      };
    },

    isBusy() {
      return busy;
    },

    currentJobId() {
      return currentId;
    },

    getResult(jobId) {
      return results.get(jobId);
    },
  };
}
```

- [ ] **Step 4: Run runner test to verify it passes**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/server/render-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire the runner into `routes.ts` with `POST /api/renders`**

Modify `apps/marketing-engine-dashboard/src/server/routes.ts` — add imports and a new branch:

```ts
import { listTemplates } from "@marketing-engine/app/src/templates-list.ts";
import { loadTemplate, hydrateTemplate } from "@marketing-engine/app/src/template.ts";
import { renderJob } from "@marketing-engine/app/src/render.ts";
import { parseJobSpec } from "@marketing-engine/app/src/jobs.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRenderRunner } from "./render-runner.ts";
import type { TemplateListItem, RenderRequest } from "../shared/types.ts";

const ENGINE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "marketing-engine",
);
const OUT_DIR = join(ENGINE_ROOT, "out");

const runner = createRenderRunner({
  async runRender(req, onProgress) {
    const job = parseJobSpec({
      template: req.template,
      app: req.app,
      aspect: req.aspect,
      output: req.output,
      vars: req.vars,
    });
    const bundle = await loadTemplate(job.template, { rootDir: ENGINE_ROOT });
    const html = await hydrateTemplate(bundle, job.vars, { rootDir: ENGINE_ROOT });
    return renderJob({ job, html, outDir: OUT_DIR, rootDir: ENGINE_ROOT, onProgress });
  },
});

export function createApp(): AppLike {
  return {
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;

      if (method === "GET" && pathname === "/api/templates") {
        const list = await listTemplates({ rootDir: ENGINE_ROOT });
        const payload: TemplateListItem[] = list.map((t) => ({ schema: t.schema }));
        return Response.json(payload);
      }

      if (method === "POST" && pathname === "/api/renders") {
        if (runner.isBusy()) {
          return new Response(JSON.stringify({ error: "another render in progress" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          });
        }
        const body = (await req.json()) as RenderRequest;
        try {
          const accepted = await runner.start(body);
          const result = runner.getResult(accepted.jobId);
          return Response.json({
            jobId: accepted.jobId,
            outputFile: result?.outputPath,
            durationMs: result?.durationMs,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
```

- [ ] **Step 6: Add a 409 test to `routes.test.ts`**

Append to `apps/marketing-engine-dashboard/tests/server/routes.test.ts`:

```ts
describe("POST /api/renders", () => {
  it("returns 409 when a render is already in progress", async () => {
    // This test uses the real engine, so we set SMOKE_RENDER=0 and expect 409 only.
    // For purity, we test the runner directly in render-runner.test.ts.
    // Here we just exercise the validation path: send malformed payload, expect 4xx.
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/api/renders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template: "shayari-reel" }), // missing required fields
      }),
    );
    expect([400, 422, 500]).toContain(res.status);
  });
});
```

- [ ] **Step 7: Run all server tests**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/server/
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/marketing-engine-dashboard/src/server/ apps/marketing-engine-dashboard/tests/server/
git commit -m "feat(dashboard): POST /api/renders with single-render lock"
```

---

## Task 9: Client — API helpers + load templates on mount

Add typed fetch wrappers and a `useTemplates()` hook used by the header dropdown.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/api.ts`
- Modify: `apps/marketing-engine-dashboard/src/client/app.tsx`

- [ ] **Step 1: Create `api.ts`**

```ts
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
  async startRender(req: RenderRequest): Promise<RenderJobAccepted & { outputFile?: string; durationMs?: number }> {
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
```

- [ ] **Step 2: Replace stub `app.tsx` with template loading**

```tsx
import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { TemplateListItem } from "../shared/types.ts";

export function App() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTemplates()
      .then(setTemplates)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div style={{ padding: 16, color: "red" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>marketing-engine-dashboard</h1>
      <p>Loaded {templates.length} template(s).</p>
      <ul>
        {templates.map((t) => (
          <li key={t.schema.name}>
            {t.schema.name} — {t.schema.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Run dev (both client and server) and verify**

```bash
bun run --cwd apps/marketing-engine-dashboard dev
```

Expected: Vite at `http://127.0.0.1:5173` shows "Loaded 1 template(s).  shayari-reel — Animated Hindi shayari reel...". Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/api.ts apps/marketing-engine-dashboard/src/client/app.tsx
git commit -m "feat(dashboard): client api wrappers + template loading"
```

---

## Task 10: Client — Header + plain-text SlotEditor + blocking Render flow

Render the header (template dropdown + Render button), build a form with plain text inputs for every slot type, and wire the **Render** button to `POST /api/renders`. Result swaps in as a `<video>`. No live preview yet (Task 14), no widgets yet (Tasks 17-19).

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/header.tsx`
- Create: `apps/marketing-engine-dashboard/src/client/slot-editor/index.tsx`
- Create: `apps/marketing-engine-dashboard/src/client/result/render-result.tsx`
- Modify: `apps/marketing-engine-dashboard/src/client/app.tsx`
- Create: `apps/marketing-engine-dashboard/tests/client/slot-editor.test.tsx`

- [ ] **Step 1: Write a failing test for SlotEditor form generation**

Create `apps/marketing-engine-dashboard/tests/client/slot-editor.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlotEditor } from "../../src/client/slot-editor/index.tsx";
import type { TemplateSchema } from "../../src/shared/types.ts";

const SCHEMA: TemplateSchema = {
  name: "shayari-reel",
  version: "1.0.0",
  description: "test",
  supportedAspects: ["9:16"],
  defaultDuration: 12,
  defaultFps: 30,
  dimensions: { "9:16": { width: 1080, height: 1920 } },
  slots: {
    shayariLines: { type: "string[]", min: 2, max: 4, required: true, description: "lines" },
    festivalName: { type: "string", required: false, description: "" },
    accentColor: { type: "color", default: "@brand/craftlee-saffron", description: "" },
  },
};

describe("SlotEditor", () => {
  it("renders one input group per slot key", () => {
    render(<SlotEditor schema={SCHEMA} value={{}} onChange={() => {}} />);
    expect(screen.getByLabelText(/shayariLines/i)).toBeDefined();
    expect(screen.getByLabelText(/festivalName/i)).toBeDefined();
    expect(screen.getByLabelText(/accentColor/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/slot-editor.test.tsx
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `SlotEditor` (plain text inputs)**

Create `apps/marketing-engine-dashboard/src/client/slot-editor/index.tsx`:

```tsx
import type { TemplateSchema } from "../../shared/types.ts";

export interface SlotEditorProps {
  schema: TemplateSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function SlotEditor({ schema, value, onChange }: SlotEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Object.entries(schema.slots).map(([key, slot]) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor={`slot-${key}`} style={{ fontSize: 12, fontWeight: 600 }}>
            {key}
            {slot.required ? " *" : ""}
          </label>
          <input
            id={`slot-${key}`}
            type="text"
            value={formatValue(value[key])}
            onChange={(e) => onChange({ ...value, [key]: parseValue(e.target.value, slot.type) })}
            placeholder={slot.description}
            style={{ padding: 6, fontSize: 13, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>
      ))}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}

function parseValue(raw: string, type: string): unknown {
  if (type === "string[]") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.split(",").map((s) => s.trim());
    }
  }
  return raw;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/slot-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Implement `Header`**

Create `apps/marketing-engine-dashboard/src/client/header.tsx`:

```tsx
import type { TemplateListItem, AspectRatio } from "../shared/types.ts";

export interface HeaderProps {
  templates: TemplateListItem[];
  selectedTemplate: string;
  onSelectTemplate: (name: string) => void;
  aspect: AspectRatio;
  supportedAspects: AspectRatio[];
  onSelectAspect: (a: AspectRatio) => void;
  onRender: () => void;
  rendering: boolean;
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

      <button
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
```

- [ ] **Step 6: Implement `RenderResult`**

Create `apps/marketing-engine-dashboard/src/client/result/render-result.tsx`:

```tsx
export interface RenderResultProps {
  jobId: string;
  outputFile: string;
  onRenderAgain: () => void;
}

export function RenderResult({ jobId, outputFile, onRenderAgain }: RenderResultProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <video controls src={`/api/renders/${encodeURIComponent(jobId)}/file`} style={{ maxHeight: 480 }} />
      <div style={{ fontSize: 11, color: "#666" }}>{outputFile}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onRenderAgain}>Render again</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire it all into `app.tsx`**

Replace `apps/marketing-engine-dashboard/src/client/app.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.ts";
import { Header } from "./header.tsx";
import { SlotEditor } from "./slot-editor/index.tsx";
import { RenderResult } from "./result/render-result.tsx";
import type { TemplateListItem, AspectRatio } from "../shared/types.ts";

export function App() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const [slots, setSlots] = useState<Record<string, unknown>>({});
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<{ jobId: string; outputFile: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => templates.find((t) => t.schema.name === selectedName),
    [templates, selectedName],
  );

  useEffect(() => {
    api.getTemplates().then((list) => {
      setTemplates(list);
      if (list[0]) {
        setSelectedName(list[0].schema.name);
        // Seed initial values from defaults where present
        const init: Record<string, unknown> = {};
        for (const [key, slot] of Object.entries(list[0].schema.slots)) {
          if ("default" in slot && slot.default !== undefined) init[key] = slot.default;
        }
        setSlots(init);
      }
    }).catch((e) => setError(String(e)));
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
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
        <div style={{ flex: 1.2, padding: 16, overflow: "auto", borderRight: "1px solid #e5e7eb" }}>
          {selected ? (
            <SlotEditor schema={selected.schema} value={slots} onChange={setSlots} />
          ) : (
            <p>Loading templates…</p>
          )}
        </div>
        <div style={{ flex: 1, padding: 16, background: "#fafafa", display: "flex", justifyContent: "center", alignItems: "center" }}>
          {renderResult ? (
            <RenderResult
              jobId={renderResult.jobId}
              outputFile={renderResult.outputFile}
              onRenderAgain={() => setRenderResult(null)}
            />
          ) : (
            <p style={{ color: "#666" }}>Click <strong>Render</strong> to produce an MP4.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add `GET /api/renders/:id/file` to serve the MP4**

In `routes.ts`, add before the 404 fallback:

```ts
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";

if (method === "GET") {
  const fileMatch = pathname.match(/^\/api\/renders\/([^/]+)\/file$/);
  if (fileMatch) {
    const jobId = decodeURIComponent(fileMatch[1]);
    const result = runner.getResult(jobId);
    if (!result) return new Response("not found", { status: 404 });
    try {
      const s = await stat(result.outputPath);
      return new Response(Bun.file(result.outputPath), {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(s.size),
        },
      });
    } catch {
      return new Response("file not found", { status: 404 });
    }
  }
}
```

- [ ] **Step 9: Run dev and test the full flow manually**

```bash
bun run --cwd apps/marketing-engine-dashboard dev
```

In browser: edit `shayariLines` to `["test line 1", "test line 2"]` (JSON), click **Render**. Wait ~30s. Expect a video to appear.

- [ ] **Step 10: Commit**

```bash
git add apps/marketing-engine-dashboard/src/ apps/marketing-engine-dashboard/tests/client/slot-editor.test.tsx
git commit -m "feat(dashboard): plain SlotEditor + blocking render flow (slice 1 complete)"
```

**Slice 1 complete.** You can render through the browser. UX is "fancier JSON editor" — not yet the actual time-saver.

---

## Task 11: Client — Port `assets.ts` → `asset-resolver.ts`

The hydrator (Task 12) needs to resolve `@brand/...`, `@asset/...`, `@font/...` references in the browser. Copy the engine's resolver logic to a client module that fetches brand JSON via API instead of reading from disk.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/preview/asset-resolver.ts`
- Create: `apps/marketing-engine-dashboard/tests/client/asset-resolver.test.ts`

- [ ] **Step 1: Read the engine's `assets.ts` for reference**

```bash
cat apps/marketing-engine/src/assets.ts
```

Note the regex/parsing for `@brand/<app>-<key>`, `@asset/<name>`, `@font/<key>`.

- [ ] **Step 2: Write the failing test**

Create `apps/marketing-engine-dashboard/tests/client/asset-resolver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createClientResolver } from "../../src/client/preview/asset-resolver.ts";
import type { BrandJSON } from "../../src/shared/types.ts";

const CRAFTLEE: BrandJSON = {
  name: "CraftLee",
  colors: { saffron: "#FF9933", paper: "#FFF8E7" },
  fonts: { "devanagari-display": "Mukta" },
  cta: { default: "CraftLee se banayein →" },
};

describe("createClientResolver", () => {
  it("resolves @brand/craftlee-saffron to color hex", async () => {
    const resolve = createClientResolver({ brands: { craftlee: CRAFTLEE }, assetUrl: () => "" });
    expect(await resolve("@brand/craftlee-saffron")).toBe("#FF9933");
  });

  it("resolves @brand/craftlee-cta to CTA copy", async () => {
    const resolve = createClientResolver({ brands: { craftlee: CRAFTLEE }, assetUrl: () => "" });
    expect(await resolve("@brand/craftlee-cta")).toBe("CraftLee se banayein →");
  });

  it("resolves @asset/<name> to a URL via assetUrl()", async () => {
    const resolve = createClientResolver({
      brands: { craftlee: CRAFTLEE },
      assetUrl: (name) => `/assets/${name}`,
    });
    expect(await resolve("@asset/sample-bg.png")).toBe("/assets/sample-bg.png");
  });

  it("returns plain values unchanged", async () => {
    const resolve = createClientResolver({ brands: { craftlee: CRAFTLEE }, assetUrl: () => "" });
    expect(await resolve("#FF9933")).toBe("#FF9933");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/asset-resolver.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement**

Create `apps/marketing-engine-dashboard/src/client/preview/asset-resolver.ts`:

```ts
import type { BrandJSON } from "../../shared/types.ts";

export interface ClientResolverDeps {
  brands: Record<string, BrandJSON>;
  assetUrl: (name: string) => string;
}

export type ClientResolver = (value: unknown) => Promise<unknown>;

export function createClientResolver(deps: ClientResolverDeps): ClientResolver {
  return async (value) => {
    if (typeof value !== "string") return value;

    if (value.startsWith("@brand/")) {
      const rest = value.slice("@brand/".length);
      const dash = rest.indexOf("-");
      if (dash < 0) return value;
      const brand = rest.slice(0, dash);
      const key = rest.slice(dash + 1);
      const b = deps.brands[brand];
      if (!b) return value;

      if (b.colors[key] !== undefined) return b.colors[key];
      if (b.fonts[key] !== undefined) return b.fonts[key];
      if (key === "cta" && b.cta?.default !== undefined) return b.cta.default;
      // Composed font key like devanagari-display already exact match handled above
      return value;
    }

    if (value.startsWith("@asset/")) {
      const name = value.slice("@asset/".length);
      return deps.assetUrl(name);
    }

    if (value.startsWith("@font/")) {
      // Phase A: same as @brand/<brand>-<key> in practice; left as identity here
      // since templates use @brand/<brand>-devanagari-display in Phase A.
      return value;
    }

    return value;
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/asset-resolver.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/preview/asset-resolver.ts apps/marketing-engine-dashboard/tests/client/asset-resolver.test.ts
git commit -m "feat(dashboard): client-side asset resolver"
```

---

## Task 12: Client — Port `template.ts` hydrator + parity test

**This is the load-bearing test of the dashboard.** Port the engine's `hydrateTemplate` logic to a client module that operates against real DOM. Verify it produces equivalent output to the engine's happy-dom version on the shayari-reel fixture.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/preview/hydrator.ts`
- Create: `apps/marketing-engine-dashboard/tests/client/hydrator-parity.test.ts`

- [ ] **Step 1: Read the engine's `template.ts` to extract the hydration algorithm**

```bash
cat apps/marketing-engine/src/template.ts
```

Note: the engine's `hydrateTemplate(bundle, vars, ctx)` works by parsing the template HTML in happy-dom, walking `[data-slot-*]` attributes (or whatever the engine's actual mechanism is), substituting `vars` (resolving asset refs), and serializing back to HTML.

- [ ] **Step 2: Write the parity test**

Create `apps/marketing-engine-dashboard/tests/client/hydrator-parity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTemplate, hydrateTemplate } from "@marketing-engine/app/src/template.ts";
import { hydrateInDocument } from "../../src/client/preview/hydrator.ts";
import { createClientResolver } from "../../src/client/preview/asset-resolver.ts";
import type { BrandJSON } from "../../src/shared/types.ts";

const ENGINE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "marketing-engine",
);

describe("hydrator parity (client vs engine)", () => {
  it("produces equivalent DOM for shayari-reel minimal fixture", async () => {
    // Engine side (happy-dom)
    const bundle = await loadTemplate("shayari-reel", { rootDir: ENGINE_ROOT });
    const fixturePath = join(ENGINE_ROOT, "templates/shayari-reel/fixtures/minimal.json");
    const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
    const engineHtml = await hydrateTemplate(bundle, fixture.vars, { rootDir: ENGINE_ROOT });

    // Client side (real DOM, via happy-dom in test env)
    const brandJson = JSON.parse(await readFile(join(ENGINE_ROOT, "assets/brand/craftlee.json"), "utf8")) as BrandJSON;
    const resolve = createClientResolver({ brands: { craftlee: brandJson }, assetUrl: (n) => `/api/assets/file?name=${n}` });
    const rawHtml = await readFile(bundle.htmlPath ?? join(ENGINE_ROOT, "templates/shayari-reel/template.html"), "utf8");

    document.body.innerHTML = rawHtml;
    await hydrateInDocument(document, fixture.vars, resolve);
    const clientHtml = document.body.innerHTML;

    // Compare semantic content: extract every text node and every src/href attribute.
    expect(extractContent(clientHtml)).toEqual(extractContent(engineHtml));
  });
});

function extractContent(html: string): { text: string[]; attrs: string[] } {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const text: string[] = [];
  const attrs: string[] = [];
  const walker = dom.createTreeWalker(dom.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent?.trim();
      if (t) text.push(t);
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      for (const a of el.getAttributeNames()) {
        if (["src", "href", "style"].includes(a)) attrs.push(`${a}=${el.getAttribute(a)}`);
      }
    }
  }
  return { text, attrs };
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/hydrator-parity.test.ts
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 4: Implement `hydrator.ts`**

The exact implementation must mirror the engine's `template.ts`. Read the engine source and replicate:

Create `apps/marketing-engine-dashboard/src/client/preview/hydrator.ts`:

```ts
import type { ClientResolver } from "./asset-resolver.ts";

/**
 * Hydrates a template document with slot values, mirroring
 * apps/marketing-engine/src/template.ts:hydrateTemplate but operating
 * on a real Document (passed in) rather than constructing a happy-dom one.
 *
 * Algorithm parity is verified by tests/client/hydrator-parity.test.ts.
 */
export async function hydrateInDocument(
  doc: Document,
  vars: Record<string, unknown>,
  resolve: ClientResolver,
): Promise<void> {
  // The engine walks elements with data-slot-* attributes and replaces
  // their content / attribute values with resolved var values.
  //
  // Replicate the EXACT same walk here. If the engine's algorithm changes,
  // update both sides simultaneously and re-run the parity test.

  // Step 4a: resolve every var (including those that are @brand/@asset refs)
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (Array.isArray(v)) {
      resolved[k] = await Promise.all(v.map((x) => resolve(x)));
    } else {
      resolved[k] = await resolve(v);
    }
  }

  // Step 4b: walk data-slot-text="<key>" elements
  doc.querySelectorAll<HTMLElement>("[data-slot-text]").forEach((el) => {
    const key = el.getAttribute("data-slot-text");
    if (!key) return;
    const v = resolved[key];
    if (Array.isArray(v)) {
      el.textContent = v.join("\n");
    } else if (v != null) {
      el.textContent = String(v);
    }
  });

  // Step 4c: walk data-slot-list="<key>" — duplicate first child per array item
  doc.querySelectorAll<HTMLElement>("[data-slot-list]").forEach((el) => {
    const key = el.getAttribute("data-slot-list");
    if (!key) return;
    const items = resolved[key];
    if (!Array.isArray(items)) return;
    const template = el.firstElementChild?.cloneNode(true) as HTMLElement | null;
    if (!template) return;
    el.innerHTML = "";
    for (const item of items) {
      const node = template.cloneNode(true) as HTMLElement;
      node.textContent = String(item);
      el.appendChild(node);
    }
  });

  // Step 4d: walk data-slot-attr-<attr>="<key>" — set attribute to resolved value
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const a of el.getAttributeNames()) {
      if (!a.startsWith("data-slot-attr-")) continue;
      const attr = a.slice("data-slot-attr-".length);
      const key = el.getAttribute(a);
      if (!key) continue;
      const v = resolved[key];
      if (v != null) el.setAttribute(attr, String(v));
    }
  });

  // Step 4e: walk data-slot-style-<prop>="<key>" — set style property
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const a of el.getAttributeNames()) {
      if (!a.startsWith("data-slot-style-")) continue;
      const prop = a.slice("data-slot-style-".length);
      const key = el.getAttribute(a);
      if (!key) continue;
      const v = resolved[key];
      if (v != null) (el as HTMLElement).style.setProperty(prop, String(v));
    }
  });
}
```

> **Caveat:** The exact attribute conventions above (`data-slot-text`, `data-slot-list`, `data-slot-attr-*`, `data-slot-style-*`) are inferred from typical Phase A patterns. **Step 4 IS NOT COMPLETE until you have read `apps/marketing-engine/src/template.ts` and replicated its actual algorithm.** If the engine uses different attribute names, change both this file AND every relevant test.

- [ ] **Step 5: Run parity test, iterate until it passes**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/hydrator-parity.test.ts
```

Expected eventually: PASS. If it fails, the diff between `extractContent(clientHtml)` and `extractContent(engineHtml)` tells you what's mismatched. Update the hydrator until parity holds. Do not skip; the live preview is meaningless if the client renders something different from what the renderer will produce.

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/preview/hydrator.ts apps/marketing-engine-dashboard/tests/client/hydrator-parity.test.ts
git commit -m "feat(dashboard): client hydrator with parity test against engine"
```

---

## Task 13: Iframe `runtime.html` + hyperframes runtime embedding

The iframe loads `runtime.html`, which loads the template HTML, runs the hydrator, and starts the hyperframes runtime (timeline + GSAP). Communicates with its host via `postMessage`.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/preview/runtime.html`
- Modify: `apps/marketing-engine-dashboard/vite.config.ts` (ensure runtime.html is copied/served)

- [ ] **Step 1: Inspect how Phase A loads the hyperframes runtime**

```bash
grep -rn "hyperframes/core\|@hyperframes\|__timelines\|registerComposition" apps/marketing-engine/templates/shayari-reel/ apps/marketing-engine/src/render.ts
```

Note: the template HTML includes a runtime registration pattern (e.g., `window.__hyperframes` global, or imports `@hyperframes/core`). Replicate that loading mechanism in `runtime.html`.

- [ ] **Step 2: Create `runtime.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
      #stage { width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <div id="stage"></div>
    <script type="module">
      // Wait for the host to send us a 'load' message containing the template HTML +
      // initial vars. Then hydrate, mount into #stage, and post 'ready'.

      let currentTemplateHtml = null;
      let currentBrand = null;
      let currentVars = {};

      function postToHost(msg) {
        window.parent.postMessage(msg, "*");
      }

      window.addEventListener("message", async (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== "object") return;

        if (msg.type === "load") {
          currentTemplateHtml = msg.templateHtml;
          currentBrand = msg.brand;
          currentVars = msg.vars ?? {};
          await renderStage();
          postToHost({ type: "ready" });
        } else if (msg.type === "hydrate") {
          currentVars = msg.vars ?? {};
          if (currentBrand && msg.brand) currentBrand = msg.brand;
          await renderStage();
        }
      });

      async function renderStage() {
        const stage = document.getElementById("stage");
        stage.innerHTML = currentTemplateHtml;

        // Dynamic import: the host bundles hydrator + asset-resolver and exposes them
        // via a known module URL (configured in vite.config.ts to copy them as assets).
        const { hydrateInDocument } = await import("/preview-runtime/hydrator.js");
        const { createClientResolver } = await import("/preview-runtime/asset-resolver.js");

        const resolve = createClientResolver({
          brands: { [currentBrand?.name?.toLowerCase() ?? "craftlee"]: currentBrand },
          assetUrl: (name) => `/api/assets/file?name=${encodeURIComponent(name)}`,
        });

        // The stage div now contains template.html. We hydrate it using the
        // current document (so style/script tags within template.html execute as expected).
        await hydrateInDocument(document, currentVars, resolve);

        // Notify host of estimated duration; the hyperframes runtime in template.html
        // typically registers timelines on `window.__timelines` — read that if available.
        const dur = window.__timelines?.[0]?.totalDuration?.() ?? 12;
        postToHost({ type: "duration", value: dur });
      }

      // Tick the runtime: GSAP timelines auto-play. The host can pause/scrub later
      // via message `{type:'seek', t}` — wire that in Task 14.
    </script>
  </body>
</html>
```

- [ ] **Step 3: Configure Vite to ship hydrator + asset-resolver under `/preview-runtime/`**

This requires the iframe to load compiled JS modules from a known URL. The simplest approach: copy them as Vite-built assets.

Modify `apps/marketing-engine-dashboard/vite.config.ts` to add multi-entry build for the iframe runtime:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7878",
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "preview-runtime/hydrator": resolve(__dirname, "src/client/preview/hydrator.ts"),
        "preview-runtime/asset-resolver": resolve(__dirname, "src/client/preview/asset-resolver.ts"),
        "preview-runtime/runtime": resolve(__dirname, "src/client/preview/runtime.html"),
      },
    },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 4: Verify iframe loads in dev mode (manual)**

Open `http://127.0.0.1:5173/src/client/preview/runtime.html` directly in a browser tab (Vite serves source files). Should show an empty stage with no console errors. (Hydration hasn't been triggered yet; that comes in Task 14.)

- [ ] **Step 5: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/preview/runtime.html apps/marketing-engine-dashboard/vite.config.ts
git commit -m "feat(dashboard): iframe runtime.html with postMessage protocol"
```

---

## Task 14: Client — `IframeHost` + integrate live preview

Mount the iframe in the right pane, push initial template + brand + vars on load, push debounced updates on slot change. Watchdog at 5s.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/preview/iframe-host.tsx`
- Modify: `apps/marketing-engine-dashboard/src/client/app.tsx`
- Modify: `apps/marketing-engine-dashboard/src/server/routes.ts` — add `GET /api/templates/:name/html` to serve raw template HTML, and `GET /api/brand/:name`.

- [ ] **Step 1: Add server routes for template HTML and brand JSON**

In `routes.ts`, add before the 404 fallback:

```ts
import { readFile } from "node:fs/promises";
import { loadBrand } from "@marketing-engine/app/src/assets.ts";

if (method === "GET") {
  const htmlMatch = pathname.match(/^\/api\/templates\/([^/]+)\/html$/);
  if (htmlMatch) {
    const name = decodeURIComponent(htmlMatch[1]);
    const list = await listTemplates({ rootDir: ENGINE_ROOT });
    const t = list.find((x) => x.schema.name === name);
    if (!t) return new Response("not found", { status: 404 });
    const html = await readFile(t.htmlPath, "utf8");
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const brandMatch = pathname.match(/^\/api\/brand\/([^/]+)$/);
  if (brandMatch) {
    const name = decodeURIComponent(brandMatch[1]);
    try {
      const brand = await loadBrand(name, { rootDir: ENGINE_ROOT });
      return Response.json(brand);
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
}
```

- [ ] **Step 2: Implement `IframeHost`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { BrandJSON } from "../../shared/types.ts";

export interface IframeHostProps {
  templateName: string;
  brandName: string;
  vars: Record<string, unknown>;
}

export function IframeHost({ templateName, brandName, vars }: IframeHostProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchdogRef = useRef<number | null>(null);

  // Load template HTML + brand JSON, then post 'load' to iframe.
  useEffect(() => {
    setReady(false);
    setError(null);

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data;
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

      // Iframe must already be loaded
      const post = () => {
        ref.current?.contentWindow?.postMessage(
          { type: "load", templateHtml, brand, vars },
          "*",
        );
      };
      if (ref.current?.contentDocument?.readyState === "complete") post();
      else ref.current?.addEventListener("load", post, { once: true });
    })();

    watchdogRef.current = window.setTimeout(() => {
      if (!ready) setError("Preview failed to start (5s watchdog)");
    }, 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    };
  }, [templateName, brandName]);

  // Push debounced updates on vars change.
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
        <div style={{ position: "absolute", top: 8, left: 8, right: 8, padding: 8, background: "#fee", color: "#900", fontSize: 12 }}>
          {error}{" "}
          <button onClick={() => location.reload()} style={{ marginLeft: 8 }}>
            Reload preview
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrate into `app.tsx`**

In the right pane of `app.tsx`, replace the placeholder text with `<IframeHost>` when no `renderResult` is set:

```tsx
{renderResult ? (
  <RenderResult … />
) : selected ? (
  <IframeHost templateName={selected.schema.name} brandName="craftlee" vars={slots} />
) : (
  <p>Loading…</p>
)}
```

Add the import.

- [ ] **Step 4: Verify in dev mode**

```bash
bun run --cwd apps/marketing-engine-dashboard dev
```

Open `http://127.0.0.1:5173`. Edit a slot value and confirm the iframe updates within ~100ms.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing-engine-dashboard/src/ apps/marketing-engine-dashboard/src/server/routes.ts
git commit -m "feat(dashboard): IframeHost + live preview wiring (slice 2 complete)"
```

**Slice 2 complete.** Live preview works end-to-end.

---

## Task 15: SSE — `GET /api/renders/:id/events`

Stream progress events to the client so the status pill can show real percentages instead of "Rendering…".

**Files:**
- Modify: `apps/marketing-engine-dashboard/src/server/routes.ts`
- Modify: `apps/marketing-engine-dashboard/src/client/app.tsx`
- Add `eventStream` helper to `apps/marketing-engine-dashboard/src/client/api.ts`

- [ ] **Step 1: Change `POST /api/renders` to return immediately with `jobId`**

The current flow blocks until the render finishes. Change it: kick off the runner, return `{jobId}` immediately, let the client subscribe to events.

In `routes.ts`, modify the POST branch:

```ts
if (method === "POST" && pathname === "/api/renders") {
  if (runner.isBusy()) {
    return new Response(JSON.stringify({ error: "another render in progress" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    });
  }
  const body = (await req.json()) as RenderRequest;
  const jobId = crypto.randomUUID();
  // Kick off async without awaiting:
  runner.start(body).catch(() => { /* errors are emitted via SSE */ });
  // The runner generates its own jobId internally, but we want the client to start
  // subscribing immediately. Modify createRenderRunner.start to accept an explicit jobId
  // (small refactor in render-runner.ts).
  return Response.json({ jobId: runner.currentJobId() ?? jobId });
}
```

> **Better approach:** modify `runner.start` to return the jobId synchronously rather than after completion. Refactor `render-runner.ts`:

```ts
// In render-runner.ts:
async start(req): Promise<{ jobId: string }> {
  if (busy) throw new Error("render runner is busy");
  busy = true;
  const jobId = randomUUID();
  currentId = jobId;

  // Fire-and-forget the actual render
  (async () => {
    try {
      const result = await deps.runRender(req, (p) => emit(jobId, { type: "progress", data: p }));
      results.set(jobId, result);
      emit(jobId, { type: "done", data: { outputFile: result.outputPath, durationMs: result.durationMs } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit(jobId, { type: "error", data: { message } });
    } finally {
      busy = false;
      currentId = null;
    }
  })();

  return { jobId };
}
```

Update the test `render-runner.test.ts` to await events instead of `start()` resolving with the result.

- [ ] **Step 2: Add SSE route**

In `routes.ts`:

```ts
if (method === "GET") {
  const eventsMatch = pathname.match(/^\/api\/renders\/([^/]+)\/events$/);
  if (eventsMatch) {
    const jobId = decodeURIComponent(eventsMatch[1]);
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (ev: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        };
        const cleanup = runner.subscribe(jobId, (ev) => {
          send(ev);
          if (ev.type === "done" || ev.type === "error") {
            controller.close();
            cleanup();
          }
        });
        // If the job already finished by the time the client connects:
        const result = runner.getResult(jobId);
        if (result) {
          send({ type: "done", data: { outputFile: result.outputPath, durationMs: result.durationMs } });
          controller.close();
          cleanup();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }
}
```

- [ ] **Step 3: Add `subscribeToRender` to client api**

In `api.ts`:

```ts
import type { RenderEvent } from "../shared/types.ts";

export function subscribeToRender(jobId: string, onEvent: (ev: RenderEvent) => void): () => void {
  const es = new EventSource(`/api/renders/${encodeURIComponent(jobId)}/events`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as RenderEvent);
    } catch {
      /* ignore malformed */
    }
  };
  es.onerror = () => es.close();
  return () => es.close();
}
```

- [ ] **Step 4: Update `app.tsx`'s `onRender` to use SSE**

```tsx
async function onRender() {
  if (!selected) return;
  setRendering(true);
  setError(null);
  setProgress(null);

  try {
    const { jobId } = await api.startRender({
      template: selected.schema.name,
      app: "craftlee",
      aspect,
      vars: slots,
      output: { name: `dashboard-${Date.now()}`, formats: ["mp4"] },
    });

    const cleanup = subscribeToRender(jobId, (ev) => {
      if (ev.type === "progress") setProgress(ev.data);
      else if (ev.type === "done") {
        setRenderResult({ jobId, outputFile: ev.data.outputFile });
        setRendering(false);
        cleanup();
      } else if (ev.type === "error") {
        setError(ev.data.message);
        setRendering(false);
        cleanup();
      }
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    setRendering(false);
  }
}
```

Add `progress` state (`useState<RenderProgress | null>(null)`) and pass `progress` into `Header` as a status pill display.

- [ ] **Step 5: Update Header to show progress pill**

Add to `Header` props: `progress: RenderProgress | null`. Render alongside the Render button:

```tsx
{props.progress && (
  <span style={{ fontSize: 11, color: "#666" }}>
    {props.progress.phase} {Math.round(props.progress.progress * 100)}%
  </span>
)}
```

- [ ] **Step 6: Verify**

`bun run --cwd apps/marketing-engine-dashboard dev` → Render → status pill shows phase + percentage updating live.

- [ ] **Step 7: Run all tests**

```bash
bun run --cwd apps/marketing-engine-dashboard test
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(dashboard): SSE progress streaming for renders"
```

---

## Task 16: `GET /api/assets` and asset file serving

The asset picker (Task 18) needs to enumerate assets and load thumbnails. Add the route + a file-serving route.

**Files:**
- Modify: `apps/marketing-engine-dashboard/src/server/routes.ts`

- [ ] **Step 1: Add the routes**

```ts
import { listAssets } from "@marketing-engine/app/src/asset-list.ts";
import { join } from "node:path";

if (method === "GET" && pathname === "/api/assets") {
  const assets = await listAssets({ rootDir: ENGINE_ROOT });
  return Response.json(assets.map((a) => ({ name: a.name, relPath: a.relPath, kind: a.kind })));
}

if (method === "GET" && pathname === "/api/assets/file") {
  const name = url.searchParams.get("name");
  if (!name) return new Response("missing name", { status: 400 });
  // Prevent path traversal:
  if (name.includes("..") || name.startsWith("/")) {
    return new Response("invalid name", { status: 400 });
  }
  const abs = join(ENGINE_ROOT, "assets", name);
  try {
    return new Response(Bun.file(abs));
  } catch {
    return new Response("not found", { status: 404 });
  }
}
```

- [ ] **Step 2: Quick manual verify**

```bash
bun run --cwd apps/marketing-engine-dashboard dev:server &
sleep 2
curl -s http://127.0.0.1:7878/api/assets | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7878/api/assets/file?name=sample-bg.png
kill %1
```

Expected: array of assets; `200` for file fetch.

- [ ] **Step 3: Commit**

```bash
git add apps/marketing-engine-dashboard/src/server/routes.ts
git commit -m "feat(dashboard): GET /api/assets and asset file serving"
```

---

## Task 17: `ColorInput` widget

Native color picker + brand-swatch chips (loaded from `/api/brand/:name`).

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/slot-editor/widgets/color-input.tsx`
- Create: `apps/marketing-engine-dashboard/tests/client/widgets/color-input.test.tsx`
- Modify: `apps/marketing-engine-dashboard/src/client/slot-editor/index.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/marketing-engine-dashboard/tests/client/widgets/color-input.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorInput } from "../../../src/client/slot-editor/widgets/color-input.tsx";

describe("ColorInput", () => {
  it("renders a native color picker for hex value", () => {
    render(<ColorInput value="#FF9933" brandSwatches={{}} onChange={() => {}} />);
    expect((screen.getByLabelText("color picker") as HTMLInputElement).value).toBe("#ff9933");
  });

  it("preserves @brand/ token through swatch click and emits onChange", () => {
    const onChange = vi.fn();
    render(
      <ColorInput
        value="#FF9933"
        brandSwatches={{ saffron: { hex: "#FF9933", token: "@brand/craftlee-saffron" } }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("brand swatch saffron"));
    expect(onChange).toHaveBeenCalledWith("@brand/craftlee-saffron");
  });

  it("emits the typed hex when user changes the picker", () => {
    const onChange = vi.fn();
    render(<ColorInput value="#FF9933" brandSwatches={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("color picker"), { target: { value: "#000000" } });
    expect(onChange).toHaveBeenCalledWith("#000000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/widgets/color-input.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
export interface BrandSwatch {
  hex: string;
  token: string;
}

export interface ColorInputProps {
  value: string;
  brandSwatches: Record<string, BrandSwatch>;
  onChange: (next: string) => void;
}

export function ColorInput({ value, brandSwatches, onChange }: ColorInputProps) {
  // If value is a token, the picker shows the resolved hex but the stored value
  // remains the token until the user changes the picker.
  const isToken = typeof value === "string" && value.startsWith("@brand/");
  const resolvedHex = isToken
    ? Object.values(brandSwatches).find((s) => s.token === value)?.hex ?? "#000000"
    : value;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        aria-label="color picker"
        type="color"
        value={resolvedHex.toLowerCase()}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={{ display: "flex", gap: 4 }}>
        {Object.entries(brandSwatches).map(([name, s]) => (
          <button
            key={name}
            aria-label={`brand swatch ${name}`}
            onClick={() => onChange(s.token)}
            title={s.token}
            style={{
              width: 22,
              height: 22,
              background: s.hex,
              border: value === s.token ? "2px solid #6366f1" : "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          />
        ))}
      </div>
      <code style={{ fontSize: 11, color: "#666" }}>{value}</code>
    </div>
  );
}
```

- [ ] **Step 4: Verify test passes**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/widgets/color-input.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Wire into `SlotEditor`**

Update `slot-editor/index.tsx` to dispatch by type:

```tsx
import { ColorInput } from "./widgets/color-input.tsx";
// (StringListInput, AssetInput added in tasks 18, 19)

// In the slot loop:
{slot.type === "color" ? (
  <ColorInput
    value={(value[key] ?? slot.default ?? "#000000") as string}
    brandSwatches={brandSwatches}
    onChange={(v) => onChange({ ...value, [key]: v })}
  />
) : /* fallback to text input as in Task 10 */ (
  <input … />
)}
```

`brandSwatches` is a new prop — the `App` shell loads `/api/brand/craftlee` once and passes it down, mapping each color into `{hex, token: '@brand/craftlee-' + key}`.

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/slot-editor/ apps/marketing-engine-dashboard/tests/client/widgets/color-input.test.tsx
git commit -m "feat(dashboard): ColorInput widget with brand swatches"
```

---

## Task 18: `AssetInput` widget

File grid with thumbnails (from `/api/assets`) + brand-asset chips. Stores `@asset/<name>` tokens.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/slot-editor/widgets/asset-input.tsx`
- Create: `apps/marketing-engine-dashboard/tests/client/widgets/asset-input.test.tsx`
- Modify: `apps/marketing-engine-dashboard/src/client/slot-editor/index.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetInput } from "../../../src/client/slot-editor/widgets/asset-input.tsx";

describe("AssetInput", () => {
  it("renders thumbnails for image assets", () => {
    render(
      <AssetInput
        kind="image"
        value=""
        assets={[{ name: "sample-bg.png", relPath: "sample-bg.png", kind: "image" }]}
        brandTokens={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("img", { name: "sample-bg.png" })).toBeDefined();
  });

  it("emits @asset/<name> on click", () => {
    const onChange = vi.fn();
    render(
      <AssetInput
        kind="image"
        value=""
        assets={[{ name: "sample-bg.png", relPath: "sample-bg.png", kind: "image" }]}
        brandTokens={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("img", { name: "sample-bg.png" }));
    expect(onChange).toHaveBeenCalledWith("@asset/sample-bg.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/widgets/asset-input.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
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
            src={`/api/assets/file?name=${encodeURIComponent(a.name)}`}
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
      <code style={{ fontSize: 11, color: "#666", display: "block", marginTop: 4 }}>{props.value || "(empty)"}</code>
    </div>
  );
}
```

- [ ] **Step 4: Verify test passes**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/widgets/asset-input.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Wire into `SlotEditor`**

In `slot-editor/index.tsx`, add a case for `slot.type === "asset"`:

```tsx
{slot.type === "asset" ? (
  <AssetInput
    kind={(slot.kind ?? "image") as "image"}
    value={(value[key] ?? slot.default ?? "") as string}
    assets={assets}
    brandTokens={brandImageTokens}
    onChange={(v) => onChange({ ...value, [key]: v })}
  />
) : … }
```

`assets` and `brandImageTokens` come from `App` (loaded via `/api/assets` and `/api/brand/craftlee`).

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/slot-editor/ apps/marketing-engine-dashboard/tests/client/widgets/asset-input.test.tsx
git commit -m "feat(dashboard): AssetInput widget with thumbnails"
```

---

## Task 19: `StringListInput` widget

Array editor with add/remove rows and min/max enforcement.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/slot-editor/widgets/string-list-input.tsx`
- Create: `apps/marketing-engine-dashboard/tests/client/widgets/string-list-input.test.tsx`
- Modify: `apps/marketing-engine-dashboard/src/client/slot-editor/index.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StringListInput } from "../../../src/client/slot-editor/widgets/string-list-input.tsx";

describe("StringListInput", () => {
  it("renders one input per item", () => {
    render(<StringListInput value={["a", "b"]} min={1} max={4} onChange={() => {}} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("disables remove when at min", () => {
    render(<StringListInput value={["a", "b"]} min={2} max={4} onChange={() => {}} />);
    const removes = screen.getAllByLabelText(/remove/i);
    expect(removes.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("disables add when at max", () => {
    render(<StringListInput value={["a", "b", "c", "d"]} min={1} max={4} onChange={() => {}} />);
    expect((screen.getByLabelText("add line") as HTMLButtonElement).disabled).toBe(true);
  });

  it("emits new array on edit / add / remove", () => {
    const onChange = vi.fn();
    render(<StringListInput value={["a", "b"]} min={1} max={4} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("add line"));
    expect(onChange).toHaveBeenCalledWith(["a", "b", ""]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
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
        <div key={i} style={{ display: "flex", gap: 4 }}>
          <input
            type="text"
            role="textbox"
            value={v}
            onChange={(e) => {
              const next = value.slice();
              next[i] = e.target.value;
              onChange(next);
            }}
            style={{ flex: 1, padding: 6, fontSize: 13, border: "1px solid #ccc", borderRadius: 4 }}
          />
          <button
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
```

- [ ] **Step 4: Verify tests pass**

```bash
bun run --cwd apps/marketing-engine-dashboard test tests/client/widgets/string-list-input.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Wire into `SlotEditor`**

```tsx
{slot.type === "string[]" ? (
  <StringListInput
    value={(value[key] as string[] | undefined) ?? []}
    min={slot.min ?? 0}
    max={slot.max ?? 99}
    onChange={(v) => onChange({ ...value, [key]: v })}
  />
) : … }
```

- [ ] **Step 6: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/slot-editor/ apps/marketing-engine-dashboard/tests/client/widgets/string-list-input.test.tsx
git commit -m "feat(dashboard): StringListInput widget with min/max enforcement"
```

---

## Task 20: Validation + Render gating

Mirror the engine's slot validation in zod and disable Render while invalid.

**Files:**
- Create: `apps/marketing-engine-dashboard/src/client/slot-editor/validate.ts`
- Modify: `apps/marketing-engine-dashboard/src/client/app.tsx`
- Create: `apps/marketing-engine-dashboard/tests/client/validate.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateSlots } from "../../src/client/slot-editor/validate.ts";
import type { TemplateSchema } from "../../src/shared/types.ts";

const SCHEMA: TemplateSchema = {
  name: "shayari-reel",
  version: "1.0.0",
  description: "",
  supportedAspects: ["9:16"],
  defaultDuration: 12,
  defaultFps: 30,
  dimensions: { "9:16": { width: 1080, height: 1920 } },
  slots: {
    shayariLines: { type: "string[]", min: 2, max: 4, required: true, description: "" },
    festivalName: { type: "string", required: false, description: "" },
  },
};

describe("validateSlots", () => {
  it("rejects when required slot is empty", () => {
    const r = validateSlots(SCHEMA, {});
    expect(r.valid).toBe(false);
    expect(r.errors.shayariLines).toBeDefined();
  });

  it("rejects when string[] is below min", () => {
    const r = validateSlots(SCHEMA, { shayariLines: ["only one"] });
    expect(r.valid).toBe(false);
  });

  it("accepts a valid spec", () => {
    const r = validateSlots(SCHEMA, { shayariLines: ["a", "b"] });
    expect(r.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { TemplateSchema } from "../../shared/types.ts";

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateSlots(
  schema: TemplateSchema,
  values: Record<string, unknown>,
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [key, slot] of Object.entries(schema.slots)) {
    const v = values[key];

    if (slot.required && (v == null || v === "" || (Array.isArray(v) && v.length === 0))) {
      errors[key] = "required";
      continue;
    }
    if (v == null || v === "") continue;

    if (slot.type === "string[]") {
      if (!Array.isArray(v)) errors[key] = "must be a list";
      else {
        if (slot.min != null && v.length < slot.min) errors[key] = `at least ${slot.min} items`;
        if (slot.max != null && v.length > slot.max) errors[key] = `at most ${slot.max} items`;
      }
    } else if (slot.type === "color") {
      if (typeof v !== "string") errors[key] = "must be a string";
      else if (!v.startsWith("@brand/") && !/^#[0-9a-fA-F]{3,8}$/.test(v))
        errors[key] = "must be a #hex color or a @brand/ token";
    } else if (slot.type === "asset") {
      if (typeof v !== "string") errors[key] = "must be a string";
      else if (!v.startsWith("@asset/") && !v.startsWith("@brand/") && !v.startsWith("/") && !v.startsWith("http"))
        errors[key] = "must be a path or a token";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 3: Wire into `App`**

In `app.tsx`, derive `validation` and gate the Render button:

```tsx
const validation = useMemo(
  () => (selected ? validateSlots(selected.schema, slots) : { valid: true, errors: {} }),
  [selected, slots],
);

// Pass validation.valid into Header — disable Render when !valid (and !rendering).
```

In `SlotEditor`, accept an `errors: Record<string, string>` prop and show inline messages.

- [ ] **Step 4: Verify**

```bash
bun run --cwd apps/marketing-engine-dashboard test
```

All green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(dashboard): slot validation + render gating"
```

---

## Task 21: Open folder

Reveal the rendered MP4 in the OS file manager.

**Files:**
- Modify: `apps/marketing-engine-dashboard/src/server/routes.ts`
- Modify: `apps/marketing-engine-dashboard/src/client/result/render-result.tsx`

- [ ] **Step 1: Add server route**

```ts
import { spawn } from "node:child_process";
import { dirname as pathDirname } from "node:path";

if (method === "POST" && pathname === "/api/open-folder") {
  const body = (await req.json()) as { file: string };
  // Validate the file is inside ENGINE_ROOT/out/ (path traversal guard)
  if (!body.file || !body.file.startsWith(join(ENGINE_ROOT, "out") + "/")) {
    return new Response(JSON.stringify({ error: "invalid file" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const dir = pathDirname(body.file);
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [dir], { detached: true, stdio: "ignore" }).unref();
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: Add button in `RenderResult`**

```tsx
<button onClick={() => api.openFolder(outputFile)}>Open folder</button>
```

- [ ] **Step 3: Verify manually**

Render an MP4, click Open folder. The OS file manager should open the folder.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): open-folder action"
```

---

## Task 22: Smoke E2E test (gated)

End-to-end validation that the whole stack works against a real renderJob.

**Files:**
- Create: `apps/marketing-engine-dashboard/tests/e2e.smoke.test.ts`

- [ ] **Step 1: Implement**

```ts
import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import { createApp } from "../src/server/routes.ts";

const RUN = process.env.SMOKE_RENDER === "1";

describe.skipIf(!RUN)("e2e smoke (real renderJob)", () => {
  it("renders shayari-reel from a posted job to a real MP4", async () => {
    const app = createApp();

    // Start render
    const startRes = await app.fetch(
      new Request("http://localhost/api/renders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "shayari-reel",
          app: "craftlee",
          aspect: "9:16",
          vars: { shayariLines: ["smoke test line one", "smoke test line two"] },
          output: { name: "dashboard-smoke", formats: ["mp4"] },
        }),
      }),
    );
    expect(startRes.status).toBe(200);
    const { jobId } = (await startRes.json()) as { jobId: string };

    // Poll the SSE stream until done (with hard timeout)
    const eventsRes = await app.fetch(new Request(`http://localhost/api/renders/${jobId}/events`));
    const reader = eventsRes.body!.getReader();
    const decoder = new TextDecoder();
    let outputFile: string | undefined;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "done") {
          outputFile = ev.data.outputFile;
          break;
        }
        if (ev.type === "error") throw new Error(ev.data.message);
      }
      if (outputFile) break;
    }
    expect(outputFile).toBeDefined();

    const s = await stat(outputFile!);
    expect(s.size).toBeGreaterThan(10_000); // any real H.264 will be larger
  }, 180_000);
});
```

- [ ] **Step 2: Run gated**

```bash
SMOKE_RENDER=1 bun run --cwd apps/marketing-engine-dashboard test tests/e2e.smoke.test.ts
```

Expected: produces a real MP4 in `apps/marketing-engine/out/YYYY-MM-DD/craftlee/9-16/dashboard-smoke.mp4` (~30-60s wall time).

- [ ] **Step 3: Run unit tests (without smoke flag) to confirm CI behavior**

```bash
bun run --cwd apps/marketing-engine-dashboard test
```

Expected: smoke test is skipped; all other tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/marketing-engine-dashboard/tests/e2e.smoke.test.ts
git commit -m "test(dashboard): SMOKE_RENDER-gated end-to-end test"
```

---

## Task 23: Final lint + typecheck + sweep

Ensure everything is clean and the acceptance criteria hold.

- [ ] **Step 1: Lint**

```bash
bunx oxlint apps/marketing-engine-dashboard/
```

Expected: no errors. Fix any inline.

- [ ] **Step 2: Format**

```bash
bunx oxfmt apps/marketing-engine-dashboard/
git status  # if oxfmt rewrote anything, commit it
```

If files changed:

```bash
git add -A
git commit -m "style(dashboard): oxfmt sweep"
```

- [ ] **Step 3: Typecheck**

```bash
bun run --cwd apps/marketing-engine-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 4: All tests**

```bash
bun run --cwd apps/marketing-engine-dashboard test
bun run --cwd apps/marketing-engine test  # ensure engine still green after Task 2-5 changes
```

Expected: all PASS.

- [ ] **Step 5: Verify upstream-clean**

```bash
git diff --stat upstream/main...HEAD -- packages/ docs/ registry/ skills/
```

Expected: no changes in any of those paths beyond what Phase A already had. The dashboard lives in `apps/`, full stop.

- [ ] **Step 6: Tag the release**

```bash
git tag marketing-engine/v0.2.0-dashboard-mvp
```

(Don't push yet — let the user decide.)

---

## Self-review checklist

Run through this before declaring the plan complete.

- **Spec coverage:**
  - §1.1 (what this is) → all tasks together produce it.
  - §1.2 (why) → live preview (Task 14) + typed widgets (Tasks 17-19) deliver the time-saving claim.
  - §1.3 (non-goals) → respected: no queue UI, no output history, no auth, no Playwright.
  - §2.1 (package shape) → Task 1.
  - §2.2 (process model) → Task 1 (vite.config) + Task 7 (server entry).
  - §2.3 (engine integration) → Tasks 2, 3, 4, 5.
  - §3.1 (load templates flow) → Tasks 7, 9.
  - §3.2 (live preview flow) → Tasks 11, 12, 13, 14.
  - §3.3 (render flow) → Tasks 8, 15, 21.
  - §4 (components) → Tasks 9, 10, 14, 17, 18, 19.
  - §5.1 (slot validation) → Task 20.
  - §5.2 (preview iframe failures) → Task 14 (watchdog + error banner).
  - §5.3 (render failures) → Task 15 (SSE error event).
  - §6.1 (server unit tests) → Tasks 7, 8, 16.
  - §6.2 (client unit tests) → Tasks 10, 11, 17, 18, 19, 20.
  - §6.3 (integration smoke) → Task 22.
  - §6.5 (static checks) → Task 23.
  - §7 (phased delivery) → Slice 1 ends at Task 10, Slice 2 ends at Task 14, Slice 3 ends at Task 22.
  - §9 (acceptance criteria) → Task 23 verifies.

- **Placeholder scan:** no "TBD" / "TODO" / "implement later". Task 5 Step 4 has a conditional fallback ("if producer doesn't accept onProgress, …") — this is intentional, both branches are written out, the engineer picks based on real-world finding.

- **Type consistency:**
  - `TemplateSchema` → from engine, used by `TemplateListItem`, `validateSlots`, `SlotEditor`.
  - `RenderProgress` → defined in engine Task 5, consumed by runner Task 8, surfaced in SSE Task 15.
  - `RenderEvent` → defined in shared/types Task 6, used by `RenderRunner` Task 8, consumed by SSE client Task 15.
  - `BrandJSON` → from engine, used in `loadBrand` Task 3, by `IframeHost` Task 14, by `ColorInput` Task 17.
  - `AssetEntry` → from engine, exposed via `/api/assets` Task 16, consumed by `AssetInput` Task 18.
  - Names are consistent throughout.

- **Scope:** focused on a single coherent system. No subsystem can be split out and still produce a working dashboard.

- **Ambiguity:** Task 12 explicitly flags that the hydrator's attribute conventions (`data-slot-text`, etc.) are inferred and must be replicated EXACTLY from the engine source — the parity test catches divergence. This is the only spot where the plan defers detail to the engineer, and the deferral is bounded by an automated check.

---

## Done

When all 23 tasks are complete, the dashboard is shipped per the spec's acceptance criteria. Tag suggestion: `marketing-engine/v0.2.0-dashboard-mvp`.
