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

## Dashboard — fully integrated into CraftLee (2026-05-02)

The marketing-engine dashboard is now a standalone admin tool living
entirely inside CraftLee's Django server at `CraftLee/server/apps/reels/`:

- Backend: `apps/reels/` — REST endpoints + Celery tasks. Renders spawn a
  fresh `bun src/cli.ts make ... --json-progress` subprocess per job
  (engine source stays here in HFrames, invoked across the language
  boundary).
- Frontend: `apps/reels/dashboard/` — React + Vite source, builds to
  `apps/reels/static/reels_dashboard/`, served same-origin by Django at
  `/staff/reels/` behind `@staff_member_required`. **No JWT, no
  token-paste.** Login at `/admin/`, navigate to `/staff/reels/`,
  Django session cookie + CSRF token cover everything.

Dev (production-mode flow — fastest):

```bash
# In CraftLee repo:
cd /path/to/CraftLee/server
bun run --cwd apps/reels/dashboard build       # ~7s; outputs to static/
.venv/bin/python manage.py runserver 127.0.0.1:8000
.venv/bin/celery -A craftlee worker -l info    # in another terminal

# Browser:
# 1. http://127.0.0.1:8000/admin/login/  (login as a staff user)
# 2. http://127.0.0.1:8000/staff/reels/  (dashboard loads)
```

Iterating on the dashboard UI: re-run the build (one command) and
hard-refresh. For HMR-grade dev, `bun run --cwd apps/reels/dashboard dev`
runs Vite at :5173 with `/api` and `/admin` proxied to :8000 — but
session-cookie scoping makes that path more fiddly, so most edits go
through the build flow.

The HFrames repo no longer ships a dashboard package — `apps/marketing-engine-dashboard/`
was deleted in the v0.3.1 cleanup commit.

See:

- `apps/marketing-engine/docs/specs/2026-05-01-django-server-design.md`
- `apps/marketing-engine/docs/plans/2026-05-01-django-server.md`

## Plans

- `apps/marketing-engine/docs/specs/2026-04-30-engine-design.md` — v1 design spec
- `apps/marketing-engine/docs/plans/2026-04-30-phase-a-mvp.md` — Phase A implementation plan
- `apps/marketing-engine/docs/specs/2026-05-01-django-server-design.md` — Django pivot spec
- `apps/marketing-engine/docs/plans/2026-05-01-django-server.md` — Django pivot plan
