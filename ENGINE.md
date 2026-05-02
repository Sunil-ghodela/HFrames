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

## Dashboard (post-2026-05-02 Django pivot)

The dashboard's server layer now lives in CraftLee's Django project at
`CraftLee/server/apps/reels/`. Renders are dispatched via Celery and spawn a
fresh `bun src/cli.ts make ... --json-progress` subprocess per job,
structurally avoiding the Bun parent-process pollution that the v0.2.0
bun server hit. The React frontend at
`apps/marketing-engine-dashboard/src/client/` is unchanged in
architecture; only API URLs and the progress-stream helper differ.

Dev:

```bash
# In CraftLee repo:
cd /path/to/CraftLee/server
.venv/bin/python manage.py runserver 127.0.0.1:8000
.venv/bin/celery -A craftlee worker -l info       # in another terminal

# In HFrames repo:
bun run --cwd apps/marketing-engine-dashboard dev   # vite at :5173, proxies /api → :8000
```

The dashboard prompts for a JWT once on first load (paste from CraftLee
admin or `manage.py shell`). It's stored in `localStorage`.

See:

- `apps/marketing-engine/docs/specs/2026-05-01-django-server-design.md`
- `apps/marketing-engine/docs/plans/2026-05-01-django-server.md`

## Plans

- `apps/marketing-engine/docs/specs/2026-04-30-engine-design.md` — v1 design spec
- `apps/marketing-engine/docs/plans/2026-04-30-phase-a-mvp.md` — Phase A implementation plan
- `apps/marketing-engine/docs/specs/2026-05-01-django-server-design.md` — Django pivot spec
- `apps/marketing-engine/docs/plans/2026-05-01-django-server.md` — Django pivot plan
