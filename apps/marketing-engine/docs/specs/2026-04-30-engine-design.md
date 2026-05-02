# Marketing Engine — Design Spec

**Date:** 2026-04-30
**Status:** Draft, pending user review
**Owner:** Vaibhav (Sunil-ghodela/HFrames fork)
**Targets:** CraftLee (primary), ReelVoice (secondary)

---

## 1. Context & Goal

### 1.1 What this is

A local content factory that produces marketing assets (9:16 reels, 1:1 posts, 16:9 banners) for **CraftLee** and **ReelVoice**, using HyperFrames as the render substrate.

Lives inside the **Sunil-ghodela/HFrames** fork of `heygen-com/hyperframes`, in an isolated `apps/marketing-engine/` workspace. Upstream HyperFrames code (`packages/`, `docs/`, `registry/`, `skills/`, `CLAUDE.md`, `AGENTS.md`) is not modified — `git pull upstream main` must always merge clean.

### 1.2 Why a new engine, not just HyperFrames CLI

HyperFrames provides composition + render. The marketing engine adds the **opinionated layer above it**:

- A small **template library** tuned for app-marketing (shayari reels, before/after voice demos, app-feature reels).
- A **job spec** schema and **dispatcher** that turns a one-line prompt into a fully resolved render job.
- A **daily cron mode** for scheduled drops driven by a festival calendar + recurring plan.
- A **brand/asset registry** so templates stay portable and per-app theming is one config file away.

### 1.3 Non-goals (v1)

| Out of scope | Why |
|---|---|
| Web UI / browser studio for non-eng users | CLI + cron is enough for Vaibhav |
| Auto-upload to Instagram / YouTube / WhatsApp | Auth + rate limits + content policies are a separate product |
| AI image/video background generation (Flux et al.) | Curated brand assets only in v1; Flux adapter is a stub |
| Languages beyond Hindi+English (Devanagari + Latin) | Tamil, Bengali, Marathi etc. = v2 |
| Templates beyond the v1 three | NFD recipe-card, TImeLeela panchang, MarketMantri charts = designed-for, not built-for |
| Distributed / Lambda rendering | Local single-machine renders only; Lambda is v3+ |
| Replacing CraftLee's content backend | Engine consumes CraftLee's existing Django API; never duplicates Gemini prompts |

---

## 2. Architecture

### 2.1 Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  CLI / Cron entry                                            │
│    `marketing-engine make` / `daily` / `templates ls`        │
├─────────────────────────────────────────────────────────────┤
│  Dispatcher                                                  │
│    prompt → (OpenRouter LLM) → resolved JobSpec              │
│    OR explicit JobSpec → straight through                    │
├─────────────────────────────────────────────────────────────┤
│  Template library     +     Asset resolver                   │
│  HTML+GSAP slots             fonts / music / bg / screenshots│
├─────────────────────────────────────────────────────────────┤
│  Renderer  →  @hyperframes/producer (programmatic, not CLI)  │
├─────────────────────────────────────────────────────────────┤
│  Output sink → out/YYYY-MM-DD/{app}/{platform}/{name}.{ext}  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Repo layout

Everything Vaibhav owns lives inside `apps/marketing-engine/` and a single root file `ENGINE.md`. Nothing else upstream is touched.

```
HFrames/
├── packages/                        ← UNTOUCHED. HeyGen upstream.
├── apps/
│   └── marketing-engine/            ← NEW. Isolated.
│       ├── src/
│       │   ├── cli.ts               citty CLI; mirrors HF style
│       │   ├── dispatcher.ts        prompt → resolved JobSpec
│       │   ├── render.ts            wraps @hyperframes/producer programmatically
│       │   ├── jobs.ts              Zod schemas: JobSpec, slot specs
│       │   ├── assets.ts            namespaced ref resolver (@brand/*, @asset/*)
│       │   ├── plans.ts             daily.yaml + festivals.yaml loader
│       │   └── adapters/
│       │       ├── openrouter.ts    primary LLM adapter (free → premium fallback)
│       │       ├── gemini.ts        alternate (kept for offline / no-OpenRouter mode)
│       │       ├── flux.ts          stub for v2 background image-gen
│       │       └── craftlee.ts      Django HTTP client for shayari content
│       ├── templates/
│       │   ├── shayari-reel/
│       │   │   ├── template.html
│       │   │   ├── template.json
│       │   │   ├── preview.png
│       │   │   └── fixtures/{minimal,full,festival-holi}.json
│       │   ├── before-after-voice/  (same structure)
│       │   └── app-feature-reel/    (same structure)
│       ├── plans/
│       │   ├── daily.yaml           recurring schedule
│       │   ├── festivals.yaml       festival calendar
│       │   └── out-of-office.yaml   skip-days
│       ├── assets/                  fonts, music, brand kits (LFS or .gitignore for large)
│       ├── tests/                   unit + e2e smoke
│       ├── out/                     gitignored render outputs
│       ├── docs/specs/              this file
│       ├── package.json             workspace member, depends on @hyperframes/*
│       └── tsconfig.json
├── ENGINE.md                        ← NEW. Fork-specific dev guide.
└── (CLAUDE.md, AGENTS.md, ... — UNTOUCHED.)
```

### 2.3 Component responsibilities

| Component | Responsibility | Knows nothing about |
|---|---|---|
| **CLI** | Parse args, dispatch to engine. Thin. | Templates, rendering, LLM. |
| **Dispatcher** | Turn prompt or partial spec into resolved JobSpec. Calls LLM only when prompt-driven. | Rendering, file I/O. |
| **Renderer** | Take resolved JobSpec → write composition HTML → call producer → return output path. | Content, prompts. |
| **Templates** | Self-contained dirs with HTML, slot schema, fixtures, preview. | Other templates. |
| **Adapters** | Pluggable boundaries for LLM / image-gen / CraftLee API. | Each other. |

---

## 3. Job Spec & Data Flow

### 3.1 JobSpec schema (Zod)

```ts
type JobSpec = {
  template: string;                    // e.g. "shayari-reel"
  app: "craftlee" | "reelvoice";       // brand kit selector
  aspect: "9:16" | "1:1" | "16:9";
  duration?: number;                   // seconds; defaults from template.json
  output: {
    name: string;                      // "holi-shayari-2026-04-30"
    formats: ("mp4" | "gif" | "png")[];
  };
  vars: Record<string, unknown>;       // slot values, validated against template.json
  audio?: {
    music?: string;                    // asset key, e.g. "@asset/calm-flute-01"
    musicVolume?: number;              // 0..1, default 0.4
    tts?: { text: string; voice: string; volume?: number };
  };
};
```

### 3.2 Template slot schema (`templates/<name>/template.json`)

```json
{
  "name": "shayari-reel",
  "version": "1.0.0",
  "description": "Animated Hindi shayari reel with festive background",
  "supportedAspects": ["9:16", "1:1"],
  "defaultDuration": 12,
  "slots": {
    "shayariLines": { "type": "string[]", "min": 2, "max": 4, "required": true },
    "background":   { "type": "asset", "kind": "image|video", "default": "@brand/festive-warm-01" },
    "festivalName": { "type": "string", "required": false },
    "ctaText":      { "type": "string", "default": "CraftLee se banayein →" },
    "accentColor":  { "type": "color", "default": "@brand/craftlee-saffron" }
  }
}
```

### 3.3 Data flow for one render

```
(1) CLI parses args → partial JobSpec
        ↓
(2) Dispatcher fills the gaps:
       - if --prompt: OpenRouter (free model first) → picks template, fills layout slots
                      Content slots that need shayari text → call CraftLee Django API
       - if --kind:   load template.json defaults; prompt user for missing required slots
                      (or read from plans/daily.yaml in cron mode)
        ↓
(3) Job validated against Zod schema (hard fail on missing required slots)
        ↓
(4) Asset resolver walks the JobSpec:
       - "@brand/craftlee-saffron"    → assets/brand/craftlee.json#colors.saffron
       - "@asset/calm-flute-01"       → assets/music/calm-flute-01.mp3
       - "@font/devanagari-display"   → assets/fonts/Mukta-Bold.ttf
        ↓
(5) Renderer:
       - reads templates/shayari-reel/template.html
       - injects slot values via data-* attributes (HF-native)
       - writes resolved composition to out/.tmp/<job-id>.html
       - calls @hyperframes/producer programmatically
        ↓
(6) Producer runs HF capture pipeline:
       - puppeteer page → seek-by-frame → image2pipe → ffmpeg
       - mixes music + TTS audio tracks
        ↓
(7) Output sink:
       - moves out/.tmp/<job-id>.mp4 → out/2026-04-30/craftlee/9-16/holi-shayari-2026-04-30.mp4
       - writes a sidecar .json with the resolved JobSpec for reproducibility
       - prints the path
```

### 3.4 Three entry shapes (all hit step 4 onward identically)

```bash
# Manual / explicit
marketing-engine make \
  --kind shayari-reel --app craftlee --aspect 9:16 \
  --var shayariLines='["zindagi ek safar hai", "har mod par ek manzil"]' \
  --var festivalName='Holi'

# Prompt-driven (LLM in the loop)
marketing-engine make --prompt "Holi shayari reel for CraftLee, romantic tone"

# From a job spec file (re-render past output)
marketing-engine make ./out/2026-04-30/craftlee/9-16/holi-shayari.json
```

### 3.5 Design rationale (the non-obvious bits)

- **Namespaced asset refs (`@brand/...`, `@asset/...`)** — keep templates portable; asset resolver is the single place that maps refs to file paths.
- **Sidecar JSON next to every output** — full reproducibility. Re-render any past asset by spec file. Critical when an output goes viral and needs a 4K version.
- **Programmatic producer call** — avoids `npx hyperframes render` process-spawn overhead in cron mode; lets us own error handling.
- **Aspect ratio is a JobSpec field, not baked into the template** — one `shayari-reel` template covers 9:16, 1:1, 16:9. ~3× template-author savings.

---

## 4. LLM Dispatcher (OpenRouter)

### 4.1 Role

Invoked **only** when the user supplies `--prompt` instead of `--kind`. One round-trip, structured-output, no chain-of-thought, no tool use.

```
Input:  { prompt, catalog of templates, brand context for app, today's date }
Output: validated JobSpec
```

The dispatcher does **not** generate shayari text. It picks the template, fills layout/asset slots, and **calls CraftLee's Django API** for any content slot that needs Hindi shayari. CraftLee already has tuned Gemini prompts; reimplementing them here would mean fighting drift forever.

### 4.2 Model strategy

| Tier | Model | When |
|---|---|---|
| Default | `google/gemini-2.0-flash-exp:free` | All daily cron drops, dev iteration |
| Premium opt-in | `anthropic/claude-sonnet-4-6` | Festival-day drops, manual `--model premium` |

**Auto-fallback chain (default):** free model → on schema-validation fail (×2) → premium model → on fail → hard error with full LLM response logged.

**Switching premium-by-default for an environment:** override `OPENROUTER_DEFAULT_MODEL` in `.env`. No engine code change.

Steady-state cost is essentially zero. Premium model is reached <5% of the time in expected usage.

### 4.3 Adapter contract

```ts
interface DispatcherAdapter {
  dispatch(prompt: string, ctx: DispatcherContext): Promise<JobSpec>;
}
```

`adapters/openrouter.ts` is the primary implementation. `adapters/gemini.ts` is kept as an alternate for offline / no-OpenRouter mode. Adapter swap is one config flag, no engine code change.

### 4.4 Environment configuration

```
OPENROUTER_API_KEY=                          # required for prompt mode (read from .env)
OPENROUTER_DEFAULT_MODEL=google/gemini-2.0-flash-exp:free
OPENROUTER_PREMIUM_MODEL=anthropic/claude-sonnet-4-6
CRAFTLEE_API_BASE=https://...                # CraftLee Django API
CRAFTLEE_API_TOKEN=                          # CraftLee API token
```

Manual `--kind` mode requires none of these — useful for offline / cron-only usage.

---

## 5. Daily Cron Mode

### 5.1 Single command

```
marketing-engine daily
```

Runs whatever's planned for today. Idempotent (re-run overwrites, sidecar JSONs preserved).

### 5.2 Plan files

```
apps/marketing-engine/plans/
  daily.yaml           recurring plan
  festivals.yaml       festival calendar (Holi, Diwali, Eid, ...)
  out-of-office.yaml   skip-days
```

`daily.yaml` example:

```yaml
schedule:
  - on: every-day
    job:
      template: shayari-reel
      app: craftlee
      aspect: 9:16
      output: { name: "shayari-${date}", formats: [mp4] }
      vars:
        festivalName: "${festival-today | none}"
        # shayariLines omitted → dispatcher fetches from CraftLee API
  - on: festival-day
    job:
      template: shayari-reel
      app: craftlee
      aspect: 1:1                           # square for WhatsApp Status
      vars: { festivalName: "${festival-today}" }
  - on: every-monday
    job:
      template: app-feature-reel
      app: reelvoice
      aspect: 9:16
      vars: { feature: "${weekly-rotation:reelvoice-features}" }
```

### 5.3 Trigger

Plain Linux cron or systemd timer. No new infra:

```cron
0 6 * * *  cd ~/AI/Jan-April.../HFrames && bun run apps/marketing-engine/src/cli.ts daily >> ~/.cache/marketing-engine.log 2>&1
```

Renders pile up in `out/<today>/` by 6 AM. Manual review + manual upload (v1).

### 5.4 Failure behavior

Each scheduled job is independent. One failure does not abort siblings. All failures aggregated to `out/<today>/_FAILED.json` with `{ jobSpec, error, stack, browserLogs }`. The `daily` command exits non-zero if any job failed — wrapper script can email/Telegram-notify.

---

## 6. v1 Template Library

Three templates only. They cover ~80% of CraftLee + ReelVoice marketing needs and stress-test every part of the engine.

### 6.1 `shayari-reel` — flagship

- **Aspects:** 9:16, 1:1, 16:9
- **Duration:** 8–15s, default 12
- **Slots:** 2–4 lines Devanagari text, festive bg image/video, soft music, optional festival badge, CraftLee CTA
- **Stress-tests:** Devanagari font rendering, GSAP staggered text reveal, music underlay, brand-color theming, multi-aspect layout from one template

### 6.2 `before-after-voice` — ReelVoice's killer format

- **Aspects:** 9:16
- **Duration:** 10–20s
- **Slots:** before-audio + after-audio assets, optional split-screen vs sequential, ReelVoice logo, CTA
- **Stress-tests:** synchronized audio playback under capture (the hard one — both audio tracks must actually play during render, not just mix into output), waveform animation, talking-head-free format

### 6.3 `app-feature-reel` — generic app-promo

- **Aspects:** 9:16, 16:9
- **Duration:** 15–25s
- **Slots:** hook text, 2–4 app screenshot beats with captions, CTA + Play Store badge
- **Stress-tests:** image sequencing, beat-by-beat caption sync, Play Store badge as overlay asset, reusable for CraftLee / ReelVoice / NFD / TImeLeela with only a screenshot swap

### 6.4 v2 candidates (not v1)

- `recipe-card-square` (NaturalFoodDictionary)
- `panchang-daily` (TImeLeela)
- `quote-card` (text-only static)
- `data-chart-reel` (MarketMantri results)

### 6.5 Adding a new template

```
apps/marketing-engine/templates/<new-name>/
  template.html
  template.json
  preview.png        (auto-generated)
  fixtures/{minimal,full,festival-holi}.json
```

`marketing-engine templates lint <name>` runs HF lint + meta-schema validation + renders all fixtures + checksums output. Same pattern HeyGen uses for registry blocks, one level up.

---

## 7. Error Handling

Three layers, fail loud, never silent.

### 7.1 Job spec validation (Zod) — fail before render starts

Missing required slot → exit 1 with exact JSON path. Wrong asset namespace → exit 1 with hint. Unknown template → exit 1 + list of valid templates. **Zero partial-state outputs from validation failures.**

### 7.2 Asset resolution — fail before puppeteer launches

Missing font/music/image is a hard error with the namespaced ref it tried (`@asset/calm-flute-01 → not found in assets/music/`). **No silent fallback to a default** — silent fallback is how you ship a video to Instagram with the wrong music.

### 7.3 Render-time — retry mechanical, propagate structural

| Class | Examples | Behavior |
|---|---|---|
| Mechanical | puppeteer flake, ffmpeg I/O, port collision | one retry with fresh process, then fail |
| Structural | composition JS error, GSAP timeline never resolves, media file corrupt | zero retry; immediate fail with browser console dumped to `out/<today>/<job-id>.error.log` |

### 7.4 Cron-mode aggregation

Per-job failures isolated to `out/<today>/_FAILED.json`. `daily` exits non-zero if any job failed. Siblings always complete.

---

## 8. Testing Strategy

### 8.1 Three tiers

| Tier | What | Speed | Where |
|---|---|---|---|
| Unit | dispatcher, jobs.ts Zod schema, asset resolver | <1s | vitest, host |
| Template fixture | render every fixture, frame-N PNG hash compare for regression | ~30–60s | inside `Dockerfile.test` (HeyGen's existing image, **not host**) |
| E2E smoke | one `marketing-engine make` per template; verify output exists, duration, file size | ~2–3 min | CI on PR, not every commit |

### 8.2 Why no producer mocking

We render real MP4s in tier 2. Mocking the producer would test the dispatcher and miss every real bug — composition HTML errors, font loading, audio sync — which is where bugs in this kind of system actually live.

### 8.3 Why Docker for fixtures

Same reason HeyGen's `CLAUDE.md` warns about producer golden tests: host Chrome / ffmpeg version drift produces pixel-different output. Reuse the existing `Dockerfile.test`, don't fight it. Ship `bun run test:fixtures:docker` as the canonical command for committed baselines.

### 8.4 Dispatcher LLM tests

Mock OpenRouter with record + replay fixtures. Real LLM calls only in a separately-tagged `test:dispatcher:live` suite that runs nightly, not on every PR. Cost containment.

---

## 9. v1 Done Criteria

The engine ships v1 when **all five** are true:

1. `marketing-engine make --kind shayari-reel --app craftlee --aspect 9:16 --var shayariLines='[...]'` produces a 9:16 MP4 Vaibhav would actually post on Instagram. (**Subjective acceptance — Vaibhav posts one.**)
2. `marketing-engine make --prompt "Holi shayari reel for CraftLee"` produces the same quality MP4 via OpenRouter dispatch.
3. `marketing-engine make --kind before-after-voice --app reelvoice --var beforeAudio=... --var afterAudio=...` produces a working reel with both audio tracks audible.
4. `marketing-engine daily` runs against `plans/daily.yaml` and produces today's planned outputs in `out/<today>/`. Re-runnable. Idempotent.
5. `bun run lint` passes (oxlint+oxfmt rules from upstream). `bun test --filter @marketing-engine/*` passes. `git pull upstream main` merges with **zero conflicts** on the upstream repo.

If 1 fails, none of the rest matter. If 5 fails, the upstream-clean promise is broken and must be fixed before any new feature.

---

## 10. Upstream-Merge Discipline

### 10.1 Boundary rules

- **Never edit anything outside** `apps/marketing-engine/`, `ENGINE.md`, `.env.example` (additions only), and root `package.json` (only to register the new workspace).
- **`packages/`, `CLAUDE.md`, `AGENTS.md`, `docs/`, `registry/`, `skills/`, `scripts/` — read-only.** If a bug is found in HeyGen's code, file it upstream and PR to `heygen-com/hyperframes`. Do not patch in the fork.

### 10.2 Sync cadence

Monthly: `git fetch upstream && git merge upstream/main`. If a conflict ever appears, by definition it's in fork-owned code (because upstream-owned files weren't touched) — easy to resolve.

### 10.3 Remotes

| Remote | URL | Purpose |
|---|---|---|
| `origin` | `git@github.com:Sunil-ghodela/HFrames.git` | Push fork-only work here |
| `upstream` | `git@github.com:heygen-com/hyperframes.git` | Pull upstream HeyGen updates here. **Never push.** |

---

## 11. Open Questions / Risks

| # | Question / Risk | Resolution path |
|---|---|---|
| 1 | Does `@hyperframes/producer` expose a stable programmatic API, or is it CLI-only today? | Verify in implementation plan step 1; if CLI-only, the renderer wraps `npx hyperframes render` for v1 (slower in cron, but works) and we open an upstream issue requesting a programmatic export. |
| 2 | Does HF support deterministic synchronized audio playback for `before-after-voice` (both tracks during capture, not just mix at end)? | Verify with a 1-day spike before committing to the template; if unsupported, the template degrades to "sequential" layout (one waveform plays, fades out, then the other) and "split-screen" becomes v2. |
| 3 | Devanagari font rendering in puppeteer-driven HF — any known glyph/ligature issues? | Smoke-test with Mukta + Tiro Devanagari fonts in the implementation plan's first PR. |
| 4 | OpenRouter free model rate limits sufficient for daily cron? | `gemini-2.0-flash-exp:free` advertised limits comfortably exceed expected use; verify in first week of operation; auto-fallback covers edge cases. |
| 5 | Asset storage strategy — Git LFS, gitignored, or external bucket? | v1: small assets committed; large (>5 MB music/video) gitignored, paths documented in `ENGINE.md`. Revisit when total asset size > 200 MB. |

---

## 12. Glossary

- **Composition** — A HyperFrames HTML file describing a video (clips, audio, timing).
- **Template** — A composition with `data-slot-*` attributes, paired with `template.json` declaring its slots. The marketing engine fills slots; HF renders the result.
- **Slot** — A named, typed placeholder in a template (e.g. `shayariLines`, `background`).
- **JobSpec** — The validated input to the renderer. Manual, prompt-driven, and spec-file paths all converge here.
- **Brand kit** — Per-app config (colors, fonts, logo, CTA copy) at `assets/brand/<app>.json`.
- **Asset ref** — Namespaced pointer like `@brand/craftlee-saffron` or `@asset/calm-flute-01`, resolved by `assets.ts`.
- **Daily plan** — `plans/daily.yaml`, the schedule that drives `marketing-engine daily`.
- **Upstream** — The `heygen-com/hyperframes` repo. Read-only from this fork's perspective.
