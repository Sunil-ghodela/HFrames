# Marketing Engine Dashboard — Design Spec

**Date:** 2026-04-30
**Status:** Draft, pending user review
**Owner:** Vaibhav (Sunil-ghodela/HFrames fork)
**Targets:** CraftLee (primary), ReelVoice (secondary)
**Companion to:** [2026-04-30-engine-design.md](./2026-04-30-engine-design.md) (engine v1 spec, §1.3 originally listed "Web UI / browser studio" as out-of-scope; this spec reopens that decision for a slim local-only dashboard.)

---

## 1. Context & Goal

### 1.1 What this is

A **local web dashboard** that gives Vaibhav a graphical version of the marketing-engine `make` CLI: pick a template, fill its slots in a form with type-aware widgets, see a live HTML preview update as you type, and click **Render** to bake an MP4 using the same `renderJob` code path the CLI uses.

Lives inside the same fork, as a new isolated workspace package: **`apps/marketing-engine-dashboard/`**. Imports `@marketing-engine/app` as a workspace dependency; never reaches into upstream `packages/`. `git pull upstream main` must continue to merge clean.

### 1.2 Why a dashboard, not "just use the CLI"

The Phase A `make` CLI takes a JobSpec JSON file and renders it. To iterate on a single reel — tweak two lines of shayari, swap the accent color, try a different background — you currently edit JSON, run `make`, wait 30s for Puppeteer + capture + ffmpeg, watch the MP4. Repeat. The friction makes the engine measurably worse than hand-editing in CapCut for short iteration loops.

The dashboard removes both costs:

- **Slot edits become instant** via an in-browser hyperframes preview iframe — no MP4 round-trip during iteration.
- **Slot input becomes typed** — color pickers, asset thumbnails, list editors with min/max enforcement — instead of remembering `@brand/...` token strings.

MP4 render is unchanged (same renderJob, same ~30s cost) but is now a one-button finalize step rather than the inner loop.

### 1.3 Non-goals (v1)

| Out of scope | Why |
|---|---|
| Render queue UI / multi-job tracking | Single-user, single-machine; one render at a time is fine |
| Output history / gallery beyond "most recent" | Files persist in `out/YYYY-MM-DD/`; OS file manager is the gallery |
| Multi-user / auth / hosted deploy | Local-only tool; binds to localhost |
| Hand-curated per-template forms | Schema-driven widget dispatch covers all current and planned templates |
| Server-side preview rendering | Live preview is client-side only; server is for MP4 render only |
| Browser-based E2E tests (Playwright) | Hydrator parity unit test covers the risky surface |
| Templates beyond the engine's v1 set (`shayari-reel`, future `before-after-voice`, `app-feature-reel`) | Same scope as the engine spec |
| LocalStorage persistence of unsaved slot values | Acceptable v1 loss; trivial to add later |

---

## 2. Architecture

### 2.1 Package shape

```
apps/marketing-engine-dashboard/
  package.json          # deps: react, vite, hono, @marketing-engine/app (workspace:*)
  vite.config.ts        # SPA build + dev proxy /api → bun server :7878
  index.html            # Vite entry
  tsconfig.json
  src/
    server/
      index.ts          # bun.serve — serves built SPA + /api/*
      routes.ts         # GET /api/templates, /api/brand/:name, /api/assets,
                        # POST /api/renders, GET /api/renders/:id/events (SSE),
                        # GET /api/renders/:id/file, POST /api/open-folder
      render-runner.ts  # imports renderJob from @marketing-engine/app,
                        # streams progress events via SSE
    client/
      main.tsx          # React root
      app.tsx           # two-pane layout shell + global state
      header.tsx        # template dropdown · aspect tabs · Render button · status pill
      slot-editor/
        index.tsx       # builds form from template.json schema
        widgets/
          string-input.tsx
          string-list-input.tsx
          color-input.tsx
          asset-input.tsx
        validate.ts     # zod schema mirroring engine's slot validation
      preview/
        iframe-host.tsx # iframe wrapper, postMessage protocol, scrubber/play
        runtime.html    # iframe doc: loads template.html + hydrator + hyperframes runtime
        hydrator.ts     # client-side port of engine's template.ts (real DOM, not happy-dom)
        asset-resolver.ts  # client-side port of engine's assets.ts
      result/
        render-result.tsx  # <video> swap + Open Folder + Render Again
      api.ts            # typed fetch wrappers
    shared/
      types.ts          # request/response shapes used by server + client
  tests/
    server/             # vitest — routes, render-runner stubs
    client/             # vitest + happy-dom — widgets, slot-editor, hydrator parity
    e2e.smoke.test.ts   # gated behind SMOKE_RENDER=1, real renderJob run
```

### 2.2 Process model

**Dev:** two processes — `vite` on `:5173` (HMR for client), `bun src/server/index.ts` on `:7878` (API + render). Vite proxies `/api/*` to the bun server.

**Prod / `bun run start`:** one process — bun serves Vite-built `dist/` static and `/api/*`.

**Bind:** `127.0.0.1` only. Not exposed to the LAN.

### 2.3 Engine integration

The server imports `@marketing-engine/app` and calls its exports as a library — same code path the CLI uses. No subprocess, no extra IPC.

**Already exposed by Phase A** (verified in `apps/marketing-engine/src/`):

- `renderJob(args: RenderArgs): Promise<RenderResult>` — `RenderArgs` is `{job, html, outDir, rootDir}`; returns `{outputPath, jobId, durationMs}`.
- `loadTemplate(name, ctx)` and `hydrateTemplate(bundle, slots, ctx)` — used by the server to produce the hydrated HTML it then hands to `renderJob`.
- `parseJobSpec`, `resolveRef`, `isAssetRef` — helpers reused by the dashboard's API validation and asset resolution.

**Gaps to add as part of the dashboard plan:**

- `listTemplates(): Promise<TemplateBundle[]>` — walks `templates/*/template.json`.
- `loadBrand(name): Promise<BrandJSON>` — reads `assets/brand/<name>.json`. Brand JSON is currently read internally by `resolveRef`; this just lifts that into a public API for the `/api/brand/:name` route.
- `listAssets(): Promise<AssetEntry[]>` — walks `assets/` (excluding `assets/brand/`), returning `{name, path, thumbnailPath?, kind}` so the asset picker can show thumbnails.
- `renderJob` gains an optional `onProgress(phase, progress)` callback. The underlying `@hyperframes/producer`'s `executeRenderJob` already supports per-stage progress (`packages/producer/src/services/renderOrchestrator.ts` — `preprocessing`, `capture`, `encode`, `postprocessing` phases with 0–1 progress); the dashboard's enhancement is plumbing that through `renderJob`'s signature so the server can forward it onto the SSE stream.

The engine package's surface area grows but its CLI behavior is unchanged.

---

## 3. Data flow

Three flows. Each is independent and self-contained.

### 3.1 Load templates (on app mount)

```
client                     server                       fs
  GET /api/templates  →     fs.readdir(templates/)
                            parse template.json each
                       ←    [{name, slots, defaults, supportedAspects, dimensions, ...}]
```

Client caches the list in React state for the session. Dropdown populates. First template auto-selected; its `defaults` populate the initial slot values.

### 3.2 Live preview (every slot edit, debounced 80 ms)

Client builds the slot value object in local React state. Pushes it to the iframe via `postMessage` — **no server roundtrip**.

```
client React state ──(slot change)──┐
                                    ▼
              iframe-host.tsx       postMessage({type:'hydrate', slots, brand, aspect})
                                    ▼
              iframe runtime.html   hydrator.ts applies slots to template.html DOM
                                    ▼
              hyperframes runtime   ticks timeline + GSAP visuals
                                    ▼
              postMessage('ready' | 'tick' | 'duration' | 'error')
```

The hydrator inside the iframe is a port of `apps/marketing-engine/src/template.ts`. The engine version runs against happy-dom; the iframe version runs against real DOM. The two must produce equivalent DOM output for the same `(template, slots, brand)` tuple — enforced by a parity unit test (§5).

Asset references (`@brand/...`, `@asset/...`, `@font/...`) get resolved by `asset-resolver.ts`, a client-side port of `assets.ts`. Brand JSON is fetched once per brand via `GET /api/brand/:name` and cached.

### 3.3 Render to MP4 (on Render click)

```
client            server                                  @marketing-engine/app
 POST /api/renders {template, slots, aspect, output}
                  → parseJobSpec(...)              → JobSpec
                  → loadTemplate + hydrateTemplate → hydrated HTML string
                  → jobId = uuid()
                  → renderJob({job, html, outDir, rootDir}, onProgress) async
 ← {jobId}
 GET /api/renders/:id/events  (Server-Sent Events)
                  ← {phase:'preprocessing', progress:0.05}
                  ← {phase:'capture',       progress:0.4}
                  ← {phase:'encode',        progress:0.8}
                  ← {phase:'done', file:'out/2026-04-30/craftlee/9-16/<name>.mp4'}
 GET /api/renders/:id/file  → MP4 bytes
                  → <RenderResult> swaps the iframe with <video src={mp4Url}>
 POST /api/open-folder {file}  → server runs xdg-open / open on the directory
```

Output file path is unchanged from the CLI: `apps/marketing-engine/out/YYYY-MM-DD/<app>/<aspect>/<job.output.name>.mp4` (the engine's `ensureDateAppAspectDir` partitioning). The dashboard does not pick the path; it just surfaces whatever `renderJob` returns in `outputPath`.

**Concurrency:** one render at a time. Clicking **Render** while a job is running is blocked at the UI layer (button disabled) and rejected at the API layer (`409 Conflict`).

---

## 4. Components

```
<App>
 ├─ <Header>
 │    template dropdown · aspect tabs (9:16/1:1/16:9 from supportedAspects)
 │    · Render button · status pill (idle / rendering 0.4 / done / error)
 ├─ <SlotEditor template={t} value={slots} onChange={…}>
 │    ├─ <StringInput>           single line; multi-line if `description` mentions "lines"
 │    ├─ <StringListInput>       array editor with min/max, reorder, +/−
 │    ├─ <ColorInput>            native picker + brand-swatch chips (from /api/brand)
 │    └─ <AssetInput kind="image">
 │           file grid with thumbs from /api/assets, brand-asset chips
 │    Every widget displays "@brand/x" / "@asset/y" tokens as resolved
 │    previews while preserving the token in onChange.
 └─ <PreviewPane>
      ├─ <IframeHost slots brand template aspect>
      │    iframe loads runtime.html which:
      │      - loads template.html
      │      - runs hydrator.ts
      │      - runs @hyperframes runtime (timeline + GSAP)
      │      - posts 'ready' / 'tick' / 'duration' / 'error'
      │    Controls: ▶/⏸ · scrubber · 0:00/0:12 · aspect frame
      └─ <RenderResult mp4Url> (replaces iframe when render finishes)
           ├── <video controls>
           └── Open folder · Render again
```

**Schema-driven dispatch:** `SlotEditor` reads `template.slots[name].type` and renders the matching widget. New types are added by registering a new widget — no per-template branching. Unknown types fall back to `StringInput` with a console warning.

**State:** lives in `<App>` as plain React state. No Redux/Zustand. No router.

**Persistence:** in-memory only for v1. Closing the tab loses unsaved slot values. Adding `localStorage` is a one-screen change post-v1 if friction warrants it.

---

## 5. Error handling

Three failure surfaces. Each has one obvious thing to do.

### 5.1 Slot validation

Client validates every slot value against a zod schema mirroring the engine's `JobSpec`. Invalid values show a red border + inline message next to the widget. **Render button is disabled while any slot is invalid.** Required-but-empty slots show a "required" hint, not an error, until the first render attempt.

### 5.2 Preview iframe failures

The runtime iframe catches its own errors and posts `{type:'error', stage:'hydrate'|'runtime', message, stack}` back to its host. `IframeHost` shows a small error banner at the top of the preview pane with the message and a **Reload preview** button that re-mounts the iframe. The slot editor stays usable.

A 5-second watchdog: if the iframe doesn't post `'ready'` after loading, the host surfaces "Preview failed to start" with the same Reload control.

### 5.3 Render failures

The SSE stream emits `{phase:'error', message}` if `renderJob` throws. UI replaces the progress bar with the error message + **Retry** + **Copy details**.

The server pre-flights the environment before kicking off a job: missing Chrome (Puppeteer) or missing `ffmpeg` produces a distinct, actionable error message ("Chrome not found — run `bunx puppeteer browsers install chrome`") instead of a stack trace.

Output file collisions: overwrite — matches existing CLI behavior. Not surfaced.

**Out of scope for v1:** retries, structured logging, error reporting beyond the in-page banner. Deliberate — single-user local tool.

---

## 6. Testing

### 6.1 Server unit tests (vitest)

- `routes.test.ts`: `GET /api/templates` returns expected shape for the fixture template; `404` for unknown. `POST /api/renders` validates the spec and returns a `jobId`; rejects malformed payloads.
- `render-runner.test.ts`: progress stream emits the expected phase sequence for a stubbed `renderJob`. Real render not invoked here.
- ~15 tests; no Puppeteer/ffmpeg required.

### 6.2 Client unit tests (vitest + happy-dom)

- `slot-editor/widgets/*.test.tsx`: each widget renders, edits, validates, emits onChange with the expected shape (including `@brand/...` token preservation through edits).
- `slot-editor.test.tsx`: builds the form correctly from `template.json`; required/min/max enforcement; render button disabled while invalid.
- `preview/hydrator.test.ts`: **load-bearing parity test.** The client-side hydrator produces equivalent DOM output to the engine's `template.ts` (which uses happy-dom) for the shayari-reel fixture. Divergence here breaks the live-preview promise.
- ~20 tests.

### 6.3 Integration smoke (gated)

- `e2e.smoke.test.ts`: starts the bun server, hits `/api/templates`, posts a render, follows the SSE stream to `done`, asserts the MP4 file exists and is non-zero. Gated behind `SMOKE_RENDER=1` (same convention as Phase A's `tests/render.smoke.test.ts`). Skipped in CI by default.
- 1 test, ~30 s wall time.

### 6.4 No browser E2E

Playwright is real cost (browser binaries, flaky CI, fixture management) for a single-user tool whose risky surface (hydrator parity) is already covered by unit tests. Reconsider if the dashboard is ever opened up to non-eng users.

### 6.5 Static checks

`bun run typecheck` runs across both client and server (one tsconfig with two project references). The lefthook pre-commit hook runs `oxlint` + `oxfmt --check` on changed files in the new package, same as the rest of the repo.

---

## 7. Phased delivery

The full dashboard breaks into three implementable slices. Each slice ends in a usable artifact.

### Slice 1 — End-to-end skeleton (~1 day)

- Package scaffolding (Vite + React + bun server).
- `/api/templates` + `/api/renders` (no SSE yet — just blocking POST that returns `{file}` when done).
- Dropdown + plain text inputs for every slot type (no widgets, no live preview).
- Click Render → wait spinner → `<video>` swaps in.

You can render shayari-reel through the browser. UX gap from CLI is small but non-zero.

### Slice 2 — Live preview (~1 day)

- `runtime.html` iframe + `hydrator.ts` port + `asset-resolver.ts` port.
- `IframeHost` with postMessage protocol, ▶/⏸, scrubber.
- Hydrator parity test.

You can edit slots and watch the composition update instantly. This is the dashboard's actual value.

### Slice 3 — Type-aware widgets + polish (~0.5 day)

- `ColorInput`, `AssetInput`, `StringListInput`.
- `/api/brand/:name`, `/api/assets`.
- SSE progress streaming + status pill.
- Open folder button.

Final form. Adding a new template is now drop-in.

Slice boundaries are explicit so the work can be checkpointed; total estimate ~2.5 days of focused work.

---

## 8. Open questions

None at spec time. All decisions resolved during brainstorming:

1. Scope = slim end-to-end loop (no queue UI, no output history beyond most recent).
2. Stack = Vite + React + bun server, library import (not subprocess).
3. Live preview = client-side iframe with postMessage hydration.
4. Slot editor = schema-driven, type-aware widgets (color picker w/ brand swatches, asset thumbnails, list editor).
5. Location = new workspace package `apps/marketing-engine-dashboard/`.
6. Layout = two-pane (form left, preview right), template dropdown in header.

---

## 9. Acceptance criteria for v1

- `bun run --cwd apps/marketing-engine-dashboard dev` opens a browser-ready dashboard at `http://localhost:5173`.
- Template dropdown lists `shayari-reel`. Selecting it populates a form with all five slots (`shayariLines`, `background`, `festivalName`, `ctaText`, `accentColor`).
- Each slot edit updates the iframe preview within 100 ms (debounced).
- Clicking **Render** produces an MP4 in `apps/marketing-engine/out/YYYY-MM-DD/<app>/<aspect>/` matching what the CLI would produce for the same JobSpec.
- Render progress streams to a status pill (capture %, encode %, done).
- Hydrator parity test passes. All unit tests green. `SMOKE_RENDER=1` integration test produces a real H.264 MP4.
- `git pull upstream main` still merges clean.
