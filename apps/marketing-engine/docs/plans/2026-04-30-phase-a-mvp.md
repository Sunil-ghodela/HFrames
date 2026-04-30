# Marketing Engine — Phase A (MVP Renderer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest end-to-end renderer that proves the architecture: `marketing-engine make --kind shayari-reel --app craftlee --aspect 9:16 --var shayariLines='[...]'` produces a real 9:16 MP4 in `out/`.

**Architecture:** A new workspace member at `apps/marketing-engine/` consumes `@hyperframes/producer` programmatically. Phase A includes one template (`shayari-reel`), Zod-validated `JobSpec`, namespaced asset resolver, and a `make` CLI command. No LLM dispatcher, no cron mode, no second/third templates — those are Plans B/C/D.

**Tech Stack:** Bun (package manager + runtime), TypeScript 5+, Zod (schema), citty (CLI, matches HF style), vitest (unit tests), happy-dom (template hydration), `@hyperframes/producer` (rendering).

**Scope:** Plan A is **only** the MVP renderer. Out of scope: OpenRouter dispatcher (Plan B), CraftLee API client (Plan B), `before-after-voice` template (Plan B), `app-feature-reel` template (Plan D), daily cron mode (Plan C), Docker fixture tests (Plan B).

**Done when:**
1. `bun install` succeeds at repo root with new workspace registered.
2. `bun run --cwd apps/marketing-engine test` passes all unit tests.
3. `bun run --cwd apps/marketing-engine make --kind shayari-reel --app craftlee --aspect 9:16 --var shayariLines='["zindagi ek safar hai","har mod par ek manzil"]'` produces a playable MP4 file.
4. `git pull upstream main` still merges clean (boundary-discipline check).
5. `bunx oxlint apps/marketing-engine/` and `bunx oxfmt --check apps/marketing-engine/` pass.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/marketing-engine/package.json` | Workspace member; deps on `@hyperframes/producer`, `zod`, `citty`, `happy-dom`, `vitest`. |
| `apps/marketing-engine/tsconfig.json` | TS config extending repo root. |
| `apps/marketing-engine/.gitignore` | Excludes `out/`, `.env`, `node_modules`, `dist`. |
| `apps/marketing-engine/src/jobs.ts` | Zod schema for `JobSpec`, parsing/validation. |
| `apps/marketing-engine/src/assets.ts` | Namespaced ref resolver (`@brand/...`, `@asset/...`). |
| `apps/marketing-engine/src/render.ts` | Wraps `@hyperframes/producer`. Inputs validated `JobSpec`, returns output MP4 path. |
| `apps/marketing-engine/src/template.ts` | Template loader + slot hydration via happy-dom. |
| `apps/marketing-engine/src/cli.ts` | citty-based CLI: `make` subcommand only in Phase A. |
| `apps/marketing-engine/templates/shayari-reel/template.html` | Composition HTML with `data-slot-*` attributes and GSAP timeline. |
| `apps/marketing-engine/templates/shayari-reel/template.json` | Slot schema, defaults, supported aspects. |
| `apps/marketing-engine/templates/shayari-reel/fixtures/minimal.json` | One fixture exercising required slots only. |
| `apps/marketing-engine/assets/brand/craftlee.json` | CraftLee brand kit (colors, fonts, CTA). |
| `apps/marketing-engine/tests/jobs.test.ts` | Unit tests for `jobs.ts` Zod schema. |
| `apps/marketing-engine/tests/assets.test.ts` | Unit tests for asset resolver. |
| `apps/marketing-engine/tests/template.test.ts` | Unit tests for template hydration (jsdom-based, no rendering). |
| `apps/marketing-engine/tests/render.smoke.test.ts` | End-to-end smoke test producing a real MP4. |
| `ENGINE.md` (repo root) | Fork-specific dev guide pointing into `apps/marketing-engine/`. |

**Files NOT in Phase A (deferred):**
- `src/dispatcher.ts`, `src/adapters/*.ts`, `src/plans.ts` (Plans B/C)
- `templates/before-after-voice/`, `templates/app-feature-reel/` (Plans B/D)
- `plans/daily.yaml`, `plans/festivals.yaml` (Plan C)

---

## Prerequisites (one-time, before any task)

Bun is not installed on the dev machine. Install it first; **all subsequent tasks fail without it.**

- [ ] **Step P1: Install bun**

```bash
curl -fsSL https://bun.sh/install | bash
exec $SHELL  # reload shell so `bun` is on PATH
bun --version  # verify; expect 1.x or higher
```

- [ ] **Step P2: Verify upstream-clean baseline**

From repo root `/home/vaibhav/AI/Jan-April.../HFrames`:

```bash
git status  # expect clean
git fetch upstream
git log --oneline upstream/main..main  # expect: only the spec doc commit
```

Expected: only fork-only commit visible (the spec doc). Any drift means upstream-discipline is already broken — fix before continuing.

---

## Task 1: Workspace Skeleton

Create the new workspace member, register it in the root `package.json` workspace globs, and verify `bun install` resolves.

**Files:**
- Create: `apps/marketing-engine/package.json`
- Create: `apps/marketing-engine/tsconfig.json`
- Create: `apps/marketing-engine/.gitignore`
- Modify: `package.json` (root) — add `apps/*` to `workspaces`

- [ ] **Step 1.1: Create `apps/marketing-engine/package.json`**

```json
{
  "name": "@marketing-engine/app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "make": "tsx src/cli.ts make",
    "cli": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hyperframes/producer": "workspace:*",
    "citty": "^0.1.6",
    "happy-dom": "^20.9.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^25.0.10",
    "tsx": "^4.21.0",
    "typescript": "^5.0.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 1.2: Create `apps/marketing-engine/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 1.3: Create `apps/marketing-engine/.gitignore`**

```
node_modules/
dist/
out/
.env
.env.local
```

- [ ] **Step 1.4: Update root `package.json` workspaces**

In `/home/vaibhav/AI/Jan-April.../HFrames/package.json`, change the `"workspaces"` array from `["packages/*"]` to `["packages/*", "apps/*"]`. Leave everything else untouched.

- [ ] **Step 1.5: Run bun install**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
bun install
```

Expected: install completes. New `node_modules/` is updated. The `@hyperframes/producer` workspace dep resolves to `packages/producer` symlink.

- [ ] **Step 1.6: Verify producer symlink**

```bash
ls -la apps/marketing-engine/node_modules/@hyperframes/producer
```

Expected: symlink pointing to `packages/producer`.

- [ ] **Step 1.7: Commit**

```bash
git add apps/marketing-engine/package.json apps/marketing-engine/tsconfig.json apps/marketing-engine/.gitignore package.json
git commit -m "feat(marketing-engine): scaffold workspace member"
```

---

## Task 2: JobSpec Schema (TDD)

Define the `JobSpec` type as a Zod schema. This is the contract every render path validates against.

**Files:**
- Create: `apps/marketing-engine/src/jobs.ts`
- Create: `apps/marketing-engine/tests/jobs.test.ts`

- [ ] **Step 2.1: Write failing test `tests/jobs.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { JobSpecSchema, parseJobSpec, type JobSpec } from "../src/jobs.ts";

describe("JobSpec schema", () => {
  it("accepts a minimal valid spec", () => {
    const spec = {
      template: "shayari-reel",
      app: "craftlee",
      aspect: "9:16",
      output: { name: "test", formats: ["mp4"] },
      vars: { shayariLines: ["line one", "line two"] },
    };
    const result = JobSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it("rejects unknown app value", () => {
    const spec = {
      template: "shayari-reel",
      app: "not-an-app",
      aspect: "9:16",
      output: { name: "test", formats: ["mp4"] },
      vars: {},
    };
    expect(JobSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects unsupported aspect", () => {
    const spec = {
      template: "x",
      app: "craftlee",
      aspect: "21:9",
      output: { name: "test", formats: ["mp4"] },
      vars: {},
    };
    expect(JobSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("requires output.name and at least one format", () => {
    const spec = {
      template: "x",
      app: "craftlee",
      aspect: "9:16",
      output: { name: "", formats: [] },
      vars: {},
    };
    expect(JobSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("parseJobSpec throws on invalid input with helpful message", () => {
    expect(() => parseJobSpec({ foo: "bar" })).toThrow(/JobSpec/);
  });

  it("infers JobSpec type", () => {
    const spec: JobSpec = {
      template: "shayari-reel",
      app: "reelvoice",
      aspect: "1:1",
      output: { name: "x", formats: ["mp4", "png"] },
      vars: { shayariLines: ["a"] },
    };
    expect(spec.app).toBe("reelvoice");
  });
});
```

- [ ] **Step 2.2: Run test, expect failure**

```bash
cd apps/marketing-engine
bun test
```

Expected: FAIL with "Cannot find module '../src/jobs.ts'" or similar.

- [ ] **Step 2.3: Implement `src/jobs.ts`**

```ts
import { z } from "zod";

export const JobSpecSchema = z.object({
  template: z.string().min(1),
  app: z.enum(["craftlee", "reelvoice"]),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  duration: z.number().positive().optional(),
  output: z.object({
    name: z.string().min(1),
    formats: z.array(z.enum(["mp4", "gif", "png"])).min(1),
  }),
  vars: z.record(z.string(), z.unknown()),
  audio: z
    .object({
      music: z.string().optional(),
      musicVolume: z.number().min(0).max(1).optional(),
      tts: z
        .object({
          text: z.string(),
          voice: z.string(),
          volume: z.number().min(0).max(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type JobSpec = z.infer<typeof JobSpecSchema>;

export function parseJobSpec(raw: unknown): JobSpec {
  const result = JobSpecSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid JobSpec:\n${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 2.4: Run test, expect pass**

```bash
bun test
```

Expected: all 6 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/marketing-engine/src/jobs.ts apps/marketing-engine/tests/jobs.test.ts
git commit -m "feat(marketing-engine): add JobSpec Zod schema and parser"
```

---

## Task 3: Asset Resolver (TDD)

Resolve namespaced refs like `@brand/craftlee-saffron` and `@asset/calm-flute-01` to file paths or scalar values (e.g. hex colors).

**Files:**
- Create: `apps/marketing-engine/src/assets.ts`
- Create: `apps/marketing-engine/tests/assets.test.ts`
- Create: `apps/marketing-engine/assets/brand/craftlee.json`

- [ ] **Step 3.1: Create `assets/brand/craftlee.json`**

```json
{
  "name": "CraftLee",
  "colors": {
    "saffron": "#FF9933",
    "deep-saffron": "#E08600",
    "ink": "#1A1A1A",
    "paper": "#FFF8E7"
  },
  "fonts": {
    "devanagari-display": "Mukta",
    "latin-body": "Inter"
  },
  "cta": {
    "default": "CraftLee se banayein →"
  }
}
```

- [ ] **Step 3.2: Write failing test `tests/assets.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolveRef, isAssetRef } from "../src/assets.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("asset resolver", () => {
  it("isAssetRef detects @brand and @asset refs", () => {
    expect(isAssetRef("@brand/craftlee-saffron")).toBe(true);
    expect(isAssetRef("@asset/calm-flute-01")).toBe(true);
    expect(isAssetRef("@font/devanagari-display")).toBe(true);
    expect(isAssetRef("plain-string")).toBe(false);
    expect(isAssetRef("#FF9933")).toBe(false);
  });

  it("resolves @brand/<app>-<key> to color value", async () => {
    const v = await resolveRef("@brand/craftlee-saffron", { rootDir: ROOT });
    expect(v).toBe("#FF9933");
  });

  it("resolves @brand/<app>-<key> for font name", async () => {
    const v = await resolveRef("@brand/craftlee-devanagari-display", { rootDir: ROOT });
    expect(v).toBe("Mukta");
  });

  it("resolves @brand/<app>-cta to CTA copy", async () => {
    const v = await resolveRef("@brand/craftlee-cta", { rootDir: ROOT });
    expect(v).toBe("CraftLee se banayein →");
  });

  it("throws on unknown brand key", async () => {
    await expect(
      resolveRef("@brand/craftlee-nonsense", { rootDir: ROOT }),
    ).rejects.toThrow(/not found/);
  });

  it("returns plain strings unchanged", async () => {
    const v = await resolveRef("just a string", { rootDir: ROOT });
    expect(v).toBe("just a string");
  });
});
```

- [ ] **Step 3.3: Run test, expect failure**

```bash
bun test tests/assets.test.ts
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 3.4: Implement `src/assets.ts`**

```ts
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ResolverContext {
  rootDir: string;
}

export function isAssetRef(value: unknown): value is string {
  return typeof value === "string" && /^@(brand|asset|font)\//.test(value);
}

export async function resolveRef(
  value: unknown,
  ctx: ResolverContext,
): Promise<string> {
  if (typeof value !== "string") {
    throw new Error(`resolveRef expected string, got ${typeof value}`);
  }
  if (!isAssetRef(value)) {
    return value;
  }
  const [namespace, rest] = value.slice(1).split("/", 2);
  if (!namespace || !rest) {
    throw new Error(`Malformed asset ref: ${value}`);
  }
  if (namespace === "brand") {
    return resolveBrandRef(rest, ctx);
  }
  if (namespace === "asset") {
    return resolveAssetFile(rest, ctx);
  }
  if (namespace === "font") {
    return resolveFontRef(rest, ctx);
  }
  throw new Error(`Unknown asset namespace: ${namespace} (in ${value})`);
}

async function resolveBrandRef(rest: string, ctx: ResolverContext): Promise<string> {
  const dashIdx = rest.indexOf("-");
  if (dashIdx < 0) {
    throw new Error(`@brand ref must be <app>-<key>: got @brand/${rest}`);
  }
  const app = rest.slice(0, dashIdx);
  const key = rest.slice(dashIdx + 1);
  const brandPath = join(ctx.rootDir, "assets", "brand", `${app}.json`);
  if (!existsSync(brandPath)) {
    throw new Error(`Brand kit not found: ${brandPath}`);
  }
  const kit: unknown = JSON.parse(await readFile(brandPath, "utf8"));
  return lookupBrandKey(kit, key, app);
}

function lookupBrandKey(kit: unknown, key: string, app: string): string {
  if (typeof kit !== "object" || kit === null) {
    throw new Error(`Brand kit for ${app} is malformed`);
  }
  const k = kit as Record<string, unknown>;
  // Try colors, fonts, cta in order
  for (const section of ["colors", "fonts"] as const) {
    const v = (k[section] as Record<string, unknown> | undefined)?.[key];
    if (typeof v === "string") return v;
  }
  if (key === "cta") {
    const v = (k.cta as Record<string, unknown> | undefined)?.default;
    if (typeof v === "string") return v;
  }
  throw new Error(`@brand/${app}-${key} not found in ${app} brand kit`);
}

async function resolveAssetFile(rest: string, ctx: ResolverContext): Promise<string> {
  // Search assets/{music,images,videos}/<rest>.<ext>
  const candidates = [
    join(ctx.rootDir, "assets", "music", rest),
    join(ctx.rootDir, "assets", "images", rest),
    join(ctx.rootDir, "assets", "videos", rest),
  ];
  for (const c of candidates) {
    for (const ext of ["", ".mp3", ".wav", ".png", ".jpg", ".mp4", ".webm"]) {
      const p = c + ext;
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`@asset/${rest} not found in assets/{music,images,videos}/`);
}

async function resolveFontRef(rest: string, ctx: ResolverContext): Promise<string> {
  // Phase A: only resolves font *family name* via brand kit lookup
  // Future: resolves to a TTF path if the font file is bundled
  // For now, treat @font/foo as @brand/<implied>-<rest>; caller passes app context elsewhere
  // Phase A keeps it simple: throw, since templates use @brand/<app>-<font-key>
  throw new Error(
    `@font/<key> not supported in Phase A. Use @brand/<app>-<font-key> instead. Got: @font/${rest}`,
  );
}
```

- [ ] **Step 3.5: Run test, expect pass**

```bash
bun test tests/assets.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 3.6: Commit**

```bash
git add apps/marketing-engine/src/assets.ts apps/marketing-engine/tests/assets.test.ts apps/marketing-engine/assets/brand/craftlee.json
git commit -m "feat(marketing-engine): add namespaced asset ref resolver"
```

---

## Task 4: Shayari-Reel Template (HTML + Schema + Fixture)

Create the first template: HTML composition with `data-slot-*` attributes, GSAP timeline, and a slot schema.

**Files:**
- Create: `apps/marketing-engine/templates/shayari-reel/template.html`
- Create: `apps/marketing-engine/templates/shayari-reel/template.json`
- Create: `apps/marketing-engine/templates/shayari-reel/fixtures/minimal.json`

- [ ] **Step 4.1: Create `templates/shayari-reel/template.html`**

```html
<!doctype html>
<html lang="hi">
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;700;800&display=swap"
      rel="stylesheet"
    />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: #000;
        font-family: "Mukta", sans-serif;
      }
      #stage {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: var(--bg-color, #1a1a1a);
      }
      .bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.6;
      }
      .lines {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 48px;
        padding: 120px;
        text-align: center;
        z-index: 2;
      }
      .line {
        font-size: 72px;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.4;
        opacity: 0;
        transform: translateY(24px);
        text-shadow: 0 4px 32px rgba(0, 0, 0, 0.6);
      }
      .festival-badge {
        position: absolute;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        padding: 16px 40px;
        background: var(--accent-color, #ff9933);
        color: #000;
        font-weight: 800;
        font-size: 36px;
        border-radius: 999px;
        opacity: 0;
        z-index: 3;
      }
      .cta {
        position: absolute;
        bottom: 140px;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 40px;
        font-weight: 700;
        color: var(--accent-color, #ff9933);
        opacity: 0;
        z-index: 3;
        text-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
      }
    </style>
  </head>
  <body>
    <div
      id="stage"
      data-composition-id="shayari-reel"
      data-start="0"
      data-width="1080"
      data-height="1920"
      data-fps="30"
      data-duration="12"
    >
      <img
        id="bg"
        class="bg clip"
        data-start="0"
        data-duration="12"
        data-track-index="0"
        data-slot="background"
        src=""
        alt=""
      />
      <div
        id="festival-badge"
        class="festival-badge clip"
        data-start="0.2"
        data-duration="11.6"
        data-track-index="1"
        data-slot="festivalName"
      ></div>
      <div
        id="lines"
        class="lines clip"
        data-start="0"
        data-duration="12"
        data-track-index="2"
        data-slot="shayariLines"
      ></div>
      <div
        id="cta"
        class="cta clip"
        data-start="9"
        data-duration="3"
        data-track-index="3"
        data-slot="ctaText"
      ></div>
    </div>
    <script>
      // GSAP timeline registered for HF seek-by-frame rendering.
      const tl = gsap.timeline({ paused: true });
      const lines = document.querySelectorAll(".line");
      lines.forEach((line, i) => {
        tl.to(
          line,
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          0.4 + i * 0.8,
        );
      });
      const badge = document.getElementById("festival-badge");
      if (badge && badge.textContent.trim()) {
        tl.to(badge, { opacity: 1, duration: 0.5 }, 0.2);
      }
      const cta = document.getElementById("cta");
      tl.to(cta, { opacity: 1, duration: 0.5 }, 9);
      window.__timelines = window.__timelines || [];
      window.__timelines.push({ id: "shayari-reel-main", timeline: tl });
    </script>
  </body>
</html>
```

- [ ] **Step 4.2: Create `templates/shayari-reel/template.json`**

```json
{
  "name": "shayari-reel",
  "version": "1.0.0",
  "description": "Animated Hindi shayari reel with festive background",
  "supportedAspects": ["9:16", "1:1", "16:9"],
  "defaultDuration": 12,
  "defaultFps": 30,
  "dimensions": {
    "9:16": { "width": 1080, "height": 1920 },
    "1:1": { "width": 1080, "height": 1080 },
    "16:9": { "width": 1920, "height": 1080 }
  },
  "slots": {
    "shayariLines": {
      "type": "string[]",
      "min": 2,
      "max": 4,
      "required": true,
      "description": "2-4 lines of Hindi shayari, displayed centered"
    },
    "background": {
      "type": "asset",
      "kind": "image",
      "default": "@brand/craftlee-paper",
      "description": "Background image asset; if a brand color, renders as solid color"
    },
    "festivalName": {
      "type": "string",
      "required": false,
      "description": "Optional festival badge text (e.g. Holi, Diwali)"
    },
    "ctaText": {
      "type": "string",
      "default": "@brand/craftlee-cta"
    },
    "accentColor": {
      "type": "color",
      "default": "@brand/craftlee-saffron"
    }
  }
}
```

- [ ] **Step 4.3: Create `templates/shayari-reel/fixtures/minimal.json`**

```json
{
  "template": "shayari-reel",
  "app": "craftlee",
  "aspect": "9:16",
  "output": { "name": "fixture-minimal", "formats": ["mp4"] },
  "vars": {
    "shayariLines": ["zindagi ek safar hai", "har mod par ek manzil"]
  }
}
```

- [ ] **Step 4.4: Commit**

```bash
git add apps/marketing-engine/templates/shayari-reel/
git commit -m "feat(marketing-engine): add shayari-reel template (HTML + schema + fixture)"
```

---

## Task 5: Template Loader & Slot Hydration (TDD)

Read a template directory, hydrate `data-slot-*` attributes against a `JobSpec.vars`, return resolved HTML ready for the producer.

**Files:**
- Create: `apps/marketing-engine/src/template.ts`
- Create: `apps/marketing-engine/tests/template.test.ts`

- [ ] **Step 5.1: Write failing test `tests/template.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTemplate, hydrateTemplate } from "../src/template.ts";
import type { JobSpec } from "../src/jobs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("template loader", () => {
  it("loads shayari-reel template + schema", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    expect(tpl.name).toBe("shayari-reel");
    expect(tpl.schema.slots.shayariLines.required).toBe(true);
    expect(tpl.html).toContain("data-composition-id=\"shayari-reel\"");
  });

  it("throws on unknown template", async () => {
    await expect(loadTemplate("does-not-exist", { rootDir: ROOT })).rejects.toThrow(/not found/);
  });
});

describe("template hydration", () => {
  const baseJob: JobSpec = {
    template: "shayari-reel",
    app: "craftlee",
    aspect: "9:16",
    output: { name: "test", formats: ["mp4"] },
    vars: {
      shayariLines: ["pehli line", "doosri line"],
      festivalName: "Holi",
    },
  };

  it("injects shayariLines as <div class='line'> children", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const html = await hydrateTemplate(tpl, baseJob, { rootDir: ROOT });
    expect(html).toContain(">pehli line<");
    expect(html).toContain(">doosri line<");
    const matches = html.match(/class="line"/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("sets festivalName text content when provided", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const html = await hydrateTemplate(tpl, baseJob, { rootDir: ROOT });
    expect(html).toMatch(/festival-badge[^>]*>Holi</);
  });

  it("removes festivalName element when slot omitted", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const job = { ...baseJob, vars: { shayariLines: ["x", "y"] } };
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });
    expect(html).not.toMatch(/festival-badge[^>]*>[^<\s]/);
  });

  it("rejects job missing required shayariLines", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const bad = { ...baseJob, vars: {} };
    await expect(hydrateTemplate(tpl, bad, { rootDir: ROOT })).rejects.toThrow(/shayariLines/);
  });

  it("applies aspect-ratio dimensions to stage", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const job = { ...baseJob, aspect: "1:1" as const };
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });
    expect(html).toMatch(/data-width="1080"/);
    expect(html).toMatch(/data-height="1080"/);
  });

  it("escapes HTML special characters in line content", async () => {
    const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
    const job = {
      ...baseJob,
      vars: { shayariLines: ["<script>x</script>", "& & &"] },
    };
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
```

- [ ] **Step 5.2: Run test, expect failure**

```bash
bun test tests/template.test.ts
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 5.3: Implement `src/template.ts`**

```ts
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { resolveRef } from "./assets.ts";
import type { JobSpec } from "./jobs.ts";

export interface SlotSchema {
  type: "string" | "string[]" | "asset" | "color" | "number";
  min?: number;
  max?: number;
  required?: boolean;
  default?: string | number;
  kind?: "image" | "video" | "audio";
  description?: string;
}

export interface TemplateSchema {
  name: string;
  version: string;
  description: string;
  supportedAspects: ("9:16" | "1:1" | "16:9")[];
  defaultDuration: number;
  defaultFps: number;
  dimensions: Record<string, { width: number; height: number }>;
  slots: Record<string, SlotSchema>;
}

export interface TemplateBundle {
  name: string;
  html: string;
  schema: TemplateSchema;
  dir: string;
}

export interface TemplateContext {
  rootDir: string;
}

export async function loadTemplate(
  name: string,
  ctx: TemplateContext,
): Promise<TemplateBundle> {
  const dir = join(ctx.rootDir, "templates", name);
  if (!existsSync(dir)) {
    throw new Error(`Template not found: ${name} (looked in ${dir})`);
  }
  const htmlPath = join(dir, "template.html");
  const schemaPath = join(dir, "template.json");
  if (!existsSync(htmlPath) || !existsSync(schemaPath)) {
    throw new Error(`Template ${name} is missing template.html or template.json`);
  }
  const html = await readFile(htmlPath, "utf8");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as TemplateSchema;
  return { name, html, schema, dir };
}

export async function hydrateTemplate(
  tpl: TemplateBundle,
  job: JobSpec,
  ctx: TemplateContext,
): Promise<string> {
  validateRequiredSlots(tpl.schema, job);

  const window = new Window();
  const document = window.document;
  document.documentElement.innerHTML = stripDoctype(tpl.html);

  // Apply dimensions for the requested aspect
  const stage = document.getElementById("stage");
  if (!stage) {
    throw new Error(`Template ${tpl.name} is missing #stage element`);
  }
  const dims = tpl.schema.dimensions[job.aspect];
  if (!dims) {
    throw new Error(
      `Template ${tpl.name} does not declare dimensions for aspect ${job.aspect}`,
    );
  }
  stage.setAttribute("data-width", String(dims.width));
  stage.setAttribute("data-height", String(dims.height));
  if (job.duration) {
    stage.setAttribute("data-duration", String(job.duration));
  }

  // Resolve slot defaults from schema, then merge with job.vars
  const merged: Record<string, unknown> = {};
  for (const [slot, def] of Object.entries(tpl.schema.slots)) {
    if (def.default !== undefined) merged[slot] = def.default;
  }
  Object.assign(merged, job.vars);

  // Walk every [data-slot] element and hydrate
  const slotEls = Array.from(document.querySelectorAll("[data-slot]"));
  for (const el of slotEls) {
    const slotName = el.getAttribute("data-slot");
    if (!slotName) continue;
    const slotDef = tpl.schema.slots[slotName];
    if (!slotDef) {
      throw new Error(`Template ${tpl.name} declares slot ${slotName} not in schema`);
    }
    let value = merged[slotName];

    // Resolve asset refs (e.g. @brand/craftlee-saffron → "#FF9933")
    if (typeof value === "string") {
      value = await resolveRef(value, ctx);
    }

    if (value === undefined || value === null || value === "") {
      // Optional slot with no value: blank out (don't remove — placeholder may be styled)
      el.textContent = "";
      continue;
    }

    if (slotDef.type === "string[]" && Array.isArray(value)) {
      el.innerHTML = value
        .map((line) => `<div class="line">${escapeHtml(String(line))}</div>`)
        .join("");
      continue;
    }

    if (el.tagName === "IMG" || el.tagName === "VIDEO") {
      el.setAttribute("src", String(value));
      continue;
    }

    el.textContent = String(value);
  }

  // Apply CSS vars for accent-color and bg-color from brand
  const accent = await maybeResolve(merged.accentColor, ctx);
  if (accent) stage.style.setProperty("--accent-color", accent);

  return "<!doctype html>\n" + document.documentElement.outerHTML;
}

function validateRequiredSlots(schema: TemplateSchema, job: JobSpec): void {
  for (const [name, def] of Object.entries(schema.slots)) {
    if (def.required && !(name in job.vars)) {
      throw new Error(`Template ${schema.name} requires slot '${name}'`);
    }
    if (def.type === "string[]" && Array.isArray(job.vars[name])) {
      const arr = job.vars[name] as unknown[];
      if (def.min !== undefined && arr.length < def.min) {
        throw new Error(
          `Slot '${name}' requires min ${def.min} items, got ${arr.length}`,
        );
      }
      if (def.max !== undefined && arr.length > def.max) {
        throw new Error(
          `Slot '${name}' allows max ${def.max} items, got ${arr.length}`,
        );
      }
    }
  }
}

async function maybeResolve(v: unknown, ctx: TemplateContext): Promise<string | null> {
  if (typeof v !== "string") return null;
  return resolveRef(v, ctx);
}

function stripDoctype(html: string): string {
  return html.replace(/<!doctype[^>]*>/i, "").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 5.4: Run test, expect pass**

```bash
bun test tests/template.test.ts
```

Expected: all 7 tests pass. If any fails, common causes: happy-dom API drift (check `Window` import), DOCTYPE preservation in `outerHTML` (mitigated by `stripDoctype` + manual prefix).

- [ ] **Step 5.5: Commit**

```bash
git add apps/marketing-engine/src/template.ts apps/marketing-engine/tests/template.test.ts
git commit -m "feat(marketing-engine): add template loader and slot hydration"
```

---

## Task 6: Render Wrapper (TDD via integration smoke test)

Wrap `@hyperframes/producer`'s programmatic API. Input: validated `JobSpec` + hydrated HTML. Output: MP4 path.

**Files:**
- Create: `apps/marketing-engine/src/render.ts`
- Create: `apps/marketing-engine/tests/render.smoke.test.ts`

This task **does** render real MP4s. The smoke test takes ~30–60s on a laptop. It is not run by the default `bun test`; it's behind a flag.

- [ ] **Step 6.1: Write smoke test `tests/render.smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, statSync, rmSync } from "node:fs";
import { renderJob } from "../src/render.ts";
import { loadTemplate, hydrateTemplate } from "../src/template.ts";
import type { JobSpec } from "../src/jobs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOULD_RUN = process.env.SMOKE_RENDER === "1";

describe.skipIf(!SHOULD_RUN)("render smoke test (real MP4 render)", () => {
  it(
    "produces a playable MP4 from shayari-reel minimal fixture",
    { timeout: 180_000 },
    async () => {
      const job: JobSpec = {
        template: "shayari-reel",
        app: "craftlee",
        aspect: "9:16",
        duration: 4, // shorter for smoke test
        output: { name: "smoke-shayari", formats: ["mp4"] },
        vars: {
          shayariLines: ["smoke test line one", "smoke test line two"],
        },
      };

      const tpl = await loadTemplate("shayari-reel", { rootDir: ROOT });
      const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });

      const outDir = join(ROOT, "out", ".smoke");
      if (existsSync(outDir)) rmSync(outDir, { recursive: true });

      const result = await renderJob({
        job,
        html,
        outDir,
        rootDir: ROOT,
      });

      expect(existsSync(result.outputPath)).toBe(true);
      const size = statSync(result.outputPath).size;
      expect(size).toBeGreaterThan(50_000); // > 50 KB sanity
      expect(result.outputPath.endsWith(".mp4")).toBe(true);
    },
  );
});
```

- [ ] **Step 6.2: Run smoke test before implementation, expect skip**

```bash
bun test tests/render.smoke.test.ts
```

Expected: test is SKIPPED (because `SMOKE_RENDER=1` not set). This confirms the test wiring; we'll re-run with the flag after implementation.

- [ ] **Step 6.3: Implement `src/render.ts`**

```ts
import { mkdir, writeFile, rename, copyFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import {
  createRenderJob,
  executeRenderJob,
  type RenderConfig,
} from "@hyperframes/producer";
import type { JobSpec } from "./jobs.ts";

export interface RenderArgs {
  job: JobSpec;
  html: string;
  outDir: string;
  rootDir: string;
}

export interface RenderResult {
  outputPath: string;
  jobId: string;
  durationMs: number;
}

export async function renderJob(args: RenderArgs): Promise<RenderResult> {
  const { job, html, outDir, rootDir } = args;
  const jobId = `${job.output.name}-${Date.now()}`;
  const projectDir = join(outDir, ".tmp", jobId);
  await mkdir(projectDir, { recursive: true });

  // Write hydrated HTML as the producer's entry file
  const htmlPath = join(projectDir, "index.html");
  await writeFile(htmlPath, html, "utf8");

  // Copy any local assets the template references (Phase A: nothing yet)
  // Future: walk html for src/href to local files under rootDir/assets and copy them here

  const finalDir = ensureDateAppAspectDir(outDir, job);
  const finalPath = join(finalDir, `${job.output.name}.mp4`);

  const config: RenderConfig = {
    fps: 30,
    quality: "standard",
    format: "mp4",
    entryFile: "index.html",
  };

  const start = Date.now();
  const renderJobInstance = createRenderJob(config);
  await executeRenderJob(renderJobInstance, projectDir, finalPath);
  const elapsed = Date.now() - start;

  // Sidecar JSON for reproducibility
  await writeFile(
    finalPath.replace(/\.mp4$/, ".json"),
    JSON.stringify(job, null, 2),
    "utf8",
  );

  return { outputPath: finalPath, jobId, durationMs: elapsed };
}

function ensureDateAppAspectDir(outDir: string, job: JobSpec): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const aspectDir = job.aspect.replace(":", "-");
  const dir = join(outDir, today, job.app, aspectDir);
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

- [ ] **Step 6.4: Run smoke test with flag, expect pass**

```bash
SMOKE_RENDER=1 bun test tests/render.smoke.test.ts
```

Expected: test passes after ~30–90s. Output MP4 lives at `apps/marketing-engine/out/.smoke/.../smoke-shayari.mp4`. Open it in a video player and verify it actually plays. **If it does not play, see Troubleshooting below before proceeding.**

**Troubleshooting:**
- *"executeRenderJob: missing entry file"* → `htmlPath` not written; check `projectDir` permissions.
- *"Chrome failed to launch"* → host needs Chrome dependencies. Re-run inside `Dockerfile.test` (Plan B will codify this).
- *Empty MP4 / black frames* → GSAP timeline not registered on `window.__timelines`. Check Step 4.1 HTML script tag.
- *Devanagari shows boxes* → Mukta font CDN load failed. Producer's network fetch may be blocked; capture inside Docker.

- [ ] **Step 6.5: Commit**

```bash
git add apps/marketing-engine/src/render.ts apps/marketing-engine/tests/render.smoke.test.ts
git commit -m "feat(marketing-engine): wrap @hyperframes/producer programmatically"
```

---

## Task 7: CLI `make` Command

Wire it all together: `marketing-engine make --kind <template> --app <app> --aspect <aspect> --var key=value ...`.

**Files:**
- Create: `apps/marketing-engine/src/cli.ts`

- [ ] **Step 7.1: Implement `src/cli.ts`**

```ts
#!/usr/bin/env tsx
import { defineCommand, runMain } from "citty";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseJobSpec, type JobSpec } from "./jobs.ts";
import { loadTemplate, hydrateTemplate } from "./template.ts";
import { renderJob } from "./render.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const makeCmd = defineCommand({
  meta: { name: "make", description: "Render a single composition from a template or spec file" },
  args: {
    kind: { type: "string", description: "Template name (e.g. shayari-reel)" },
    app: { type: "string", description: "App brand kit (craftlee | reelvoice)" },
    aspect: { type: "string", description: "Aspect ratio (9:16 | 1:1 | 16:9)" },
    duration: { type: "string", description: "Override duration in seconds" },
    name: { type: "string", description: "Output base name (default: <kind>-<timestamp>)" },
    var: {
      type: "string",
      description: "Slot var, repeatable: --var key=value or --var key=<JSON>",
      multiple: true,
    },
    spec: { type: "string", description: "Path to a JobSpec JSON file (overrides other flags)" },
  },
  async run({ args }) {
    let job: JobSpec;
    if (args.spec) {
      const fs = await import("node:fs/promises");
      const raw = JSON.parse(await fs.readFile(args.spec, "utf8"));
      job = parseJobSpec(raw);
    } else {
      job = buildJobFromFlags(args);
    }

    const tpl = await loadTemplate(job.template, { rootDir: ROOT });
    const html = await hydrateTemplate(tpl, job, { rootDir: ROOT });

    const outDir = join(ROOT, "out");
    const result = await renderJob({ job, html, outDir, rootDir: ROOT });

    console.log(`✓ rendered in ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log(result.outputPath);
  },
});

function buildJobFromFlags(args: Record<string, unknown>): JobSpec {
  const kind = required(args.kind, "--kind");
  const app = required(args.app, "--app");
  const aspect = required(args.aspect, "--aspect");
  const vars: Record<string, unknown> = {};
  const rawVars = (args.var as string[] | undefined) ?? [];
  for (const v of rawVars) {
    const eq = v.indexOf("=");
    if (eq < 0) throw new Error(`--var must be key=value, got: ${v}`);
    const key = v.slice(0, eq);
    const val = v.slice(eq + 1);
    vars[key] = parseValue(val);
  }
  const name = (args.name as string | undefined) ?? `${kind}-${Date.now()}`;
  const duration = args.duration ? Number(args.duration) : undefined;
  return parseJobSpec({
    template: kind,
    app,
    aspect,
    duration,
    output: { name, formats: ["mp4"] },
    vars,
  });
}

function required(v: unknown, flag: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${flag} is required`);
  }
  return v;
}

function parseValue(raw: string): unknown {
  // Accept JSON for arrays/objects/numbers/bools, fall back to string
  if (
    (raw.startsWith("[") && raw.endsWith("]")) ||
    (raw.startsWith("{") && raw.endsWith("}")) ||
    raw === "true" ||
    raw === "false" ||
    /^-?\d+(\.\d+)?$/.test(raw)
  ) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through
    }
  }
  return raw;
}

const main = defineCommand({
  meta: { name: "marketing-engine", description: "Local marketing-content factory" },
  subCommands: { make: makeCmd },
});

void runMain(main);
```

- [ ] **Step 7.2: Manual end-to-end test**

```bash
cd apps/marketing-engine
bun run cli make --kind shayari-reel --app craftlee --aspect 9:16 \
  --var 'shayariLines=["zindagi ek safar hai","har mod par ek manzil"]' \
  --name "manual-e2e-test" \
  --duration 4
```

Expected:
- Command exits 0.
- Stdout includes `✓ rendered in N.Ns` and a path under `out/<today>/craftlee/9-16/manual-e2e-test.mp4`.
- That MP4 plays and shows two lines of text appearing.

**If this fails:** the most common causes are (a) Chrome dependencies missing on host (run inside Docker — Plan B will codify), (b) Mukta font CDN blocked, (c) HF runtime not built (run `bun run build:hyperframes-runtime` from repo root once).

- [ ] **Step 7.3: Lint + format check**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
bunx oxlint apps/marketing-engine/
bunx oxfmt --check apps/marketing-engine/
```

Expected: both clean. If oxfmt complains, run `bunx oxfmt apps/marketing-engine/` and re-commit.

- [ ] **Step 7.4: Commit**

```bash
git add apps/marketing-engine/src/cli.ts
git commit -m "feat(marketing-engine): add make CLI for single-template renders"
```

---

## Task 8: ENGINE.md Fork-Specific Dev Guide

Document the fork-only conventions: where code lives, how to run things, the upstream-merge boundary.

**Files:**
- Create: `ENGINE.md` (repo root)

- [ ] **Step 8.1: Create `ENGINE.md`**

```markdown
# ENGINE.md

Fork-specific dev guide for the **marketing-engine** app — content factory for
CraftLee + ReelVoice promo assets, built on HyperFrames.

This file covers fork-only work. Upstream HyperFrames docs (`CLAUDE.md`,
`AGENTS.md`, `docs/`, `packages/`) are authoritative for the framework itself
and must not be edited from this fork.

## Fork-only boundary

All fork code lives in:

- `apps/marketing-engine/` — engine source, templates, assets, tests
- `ENGINE.md` — this file
- `package.json` workspace globs (one entry: `apps/*`)
- `.env.example` (additions only)

Everything else is upstream-owned: read-only.

## Quick start

```bash
# One-time
curl -fsSL https://bun.sh/install | bash
exec $SHELL
bun install                                       # from repo root

# Render a single shayari reel
bun run --cwd apps/marketing-engine cli make \
  --kind shayari-reel --app craftlee --aspect 9:16 \
  --var 'shayariLines=["line one","line two"]' \
  --duration 4

# Output: apps/marketing-engine/out/<today>/craftlee/9-16/<name>.mp4
```

## Tests

```bash
# Unit tests (fast, < 1s)
bun run --cwd apps/marketing-engine test

# Smoke test (real MP4 render, ~30-90s)
SMOKE_RENDER=1 bun run --cwd apps/marketing-engine test tests/render.smoke.test.ts
```

## Upstream sync

```bash
git fetch upstream
git merge upstream/main      # should be conflict-free; if not, your code crossed the boundary
```

## Adding a new template

1. Create `apps/marketing-engine/templates/<name>/` with `template.html`,
   `template.json`, and `fixtures/minimal.json`.
2. Run a smoke render with the fixture to verify.
3. Document slots in `template.json#slots[*].description`.

## Plans

- `apps/marketing-engine/docs/specs/2026-04-30-engine-design.md` — v1 design spec
- `apps/marketing-engine/docs/plans/2026-04-30-phase-a-mvp.md` — Phase A implementation plan
```

- [ ] **Step 8.2: Commit**

```bash
git add ENGINE.md
git commit -m "docs: add ENGINE.md fork-specific dev guide"
```

---

## Task 9: Verify Done Criteria

Confirm every Plan A done criterion before declaring complete.

- [ ] **Step 9.1: Workspace registers cleanly**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
bun install
```

Expected: succeeds, `node_modules/@marketing-engine/app` exists or workspace symlink in place.

- [ ] **Step 9.2: Unit tests pass**

```bash
bun run --cwd apps/marketing-engine test
```

Expected: all unit tests pass (jobs, assets, template). Smoke test is SKIPPED (no `SMOKE_RENDER=1`).

- [ ] **Step 9.3: Manual E2E render**

```bash
bun run --cwd apps/marketing-engine cli make \
  --kind shayari-reel --app craftlee --aspect 9:16 \
  --var 'shayariLines=["zindagi ek safar hai","har mod par ek manzil"]' \
  --duration 8
```

Expected: an MP4 is produced under `apps/marketing-engine/out/<today>/craftlee/9-16/`. Open it; it plays; both lines appear.

- [ ] **Step 9.4: Lint + format pass**

```bash
bunx oxlint apps/marketing-engine/
bunx oxfmt --check apps/marketing-engine/
```

Expected: both clean.

- [ ] **Step 9.5: Upstream merge stays clean**

```bash
git fetch upstream
git merge --no-commit --no-ff upstream/main
git diff --name-only --diff-filter=U  # should print nothing (no conflicts)
git merge --abort                      # discard the test merge
```

Expected: no conflicting files. If anything outside `apps/marketing-engine/`, `ENGINE.md`, root `package.json`, or `.env.example` shows up, the boundary was crossed.

- [ ] **Step 9.6: Push to fork**

```bash
git push origin main
```

Expected: push succeeds against `Sunil-ghodela/HFrames`.

- [ ] **Step 9.7: Tag the milestone**

```bash
git tag -a marketing-engine/v0.1.0-phase-a -m "Phase A: MVP renderer ships"
git push origin marketing-engine/v0.1.0-phase-a
```

---

## Self-Review Notes

**Coverage check (spec → plan):**
- ✅ Spec §2 architecture: Tasks 1, 5, 6, 7 implement the layered flow (CLI → renderer → producer).
- ✅ Spec §3 JobSpec: Task 2.
- ✅ Spec §3 template schema: Task 4.
- ✅ Spec §3 asset refs: Task 3.
- ✅ Spec §6.1 shayari-reel template: Task 4.
- ✅ Spec §10 upstream-merge discipline: Task 1 (gitignore), Task 8 (ENGINE.md), Task 9 (boundary verification step).
- ⊘ Spec §4 OpenRouter dispatcher: deferred to Plan B (intentional).
- ⊘ Spec §5 cron mode: deferred to Plan C (intentional).
- ⊘ Spec §6.2/6.3 other templates: deferred to Plans B/D (intentional).
- ⊘ Spec §7.3 retry-on-mechanical-flake: deferred to Plan B (Phase A renders directly; retries layered on later when failure modes are visible).
- ⊘ Spec §8 Docker fixture testing: deferred to Plan B (Phase A's smoke test is host-side, not committed-output regression).

**Risks called out:**
- Spec Risk #1 (programmatic producer API) was verified during plan-writing: producer exports `createRenderJob` + `executeRenderJob` cleanly. Risk closed.
- Spec Risk #2 (synchronized audio playback for `before-after-voice`) is irrelevant to Phase A and validated in Plan B.
- Spec Risk #3 (Devanagari rendering) is hit immediately in Task 6.4's smoke test. If it fails, the troubleshooting in Step 6.4 is the first response.

**Type consistency check:**
- `JobSpec` defined in Task 2.3, used in Task 5.3 (`hydrateTemplate`), Task 6.3 (`renderJob`), Task 7.1 (`buildJobFromFlags`). Same shape throughout.
- `TemplateBundle` defined in Task 5.3, used in Task 7.1's CLI. Same shape.
- `RenderArgs` / `RenderResult` defined in Task 6.3, used in Task 7.1. Same shape.

No placeholders. No "TBD". No "similar to Task N" hand-waves.

---

## What ships at end of Plan A

- A new `apps/marketing-engine/` workspace member.
- One template (`shayari-reel`) renderable at 9:16, 1:1, and 16:9.
- A `marketing-engine make` CLI that produces playable MP4s.
- Unit tests covering schema, asset resolver, template hydration.
- One smoke test that validates a real MP4 render end-to-end.
- An `ENGINE.md` documenting the fork-only conventions.
- A tagged release `marketing-engine/v0.1.0-phase-a`.

## What's next (Plans B/C/D)

- **Plan B (LLM dispatcher + before-after-voice):** OpenRouter adapter, prompt mode, CraftLee API client, second template, Docker fixture tests.
- **Plan C (Cron mode):** `daily.yaml`, `festivals.yaml`, `marketing-engine daily`, failure aggregation.
- **Plan D (Third template + v1 acceptance):** `app-feature-reel`, full v1 done-criteria validation.
