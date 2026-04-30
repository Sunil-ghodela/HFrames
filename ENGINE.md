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
