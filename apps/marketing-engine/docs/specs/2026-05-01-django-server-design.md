# Marketing Engine Django Server — Design Spec

**Date:** 2026-05-01
**Status:** Draft, pending implementation plan
**Owner:** Vaibhav (Sunil-ghodela/HFrames fork)
**Targets:** CraftLee (primary), ReelVoice (secondary, future)
**Companion to:**
- [2026-04-30-engine-design.md](./2026-04-30-engine-design.md) — engine v1 spec (renderJob CLI, JobSpec schema, asset resolver). Untouched by this pivot.
- [2026-04-30-dashboard-design.md](./2026-04-30-dashboard-design.md) — bun-server dashboard v1 spec. **Superseded for the server layer.** The React frontend it describes is reused; the bun server is replaced by Django.

---

## 1. Context & Goal

### 1.1 What this is

A **Django-based marketing-engine server**, running inside the existing CraftLee Django project as a new app `apps/reels/`. It exposes the same REST surface the React dashboard already consumes (template list, brand JSON, asset list, render API, render status, MP4 download), but with the heavy work — invoking the engine's `renderJob` — moved into a Celery worker that spawns the engine as a subprocess (`bun src/cli.ts make ... --json-progress`).

The React dashboard at `apps/marketing-engine-dashboard/src/client/` is reused as-is, with only its `api.ts` URLs and progress-stream helper rewritten to talk to Django + poll instead of Bun + EventSource.

### 1.2 Why this pivot

The bun-server dashboard shipped in `marketing-engine/v0.2.0-dashboard-mvp` works for live preview and successfully produces MP4s (verified 2026-05-01: `diag5.mp4`, `diag6.mp4` — H.264 1080×1920, 12s, ~60KB). But two issues surfaced in real use that are **structural, not bugs**:

1. **Bun process pollution after each render.** The producer's Puppeteer subprocess interaction leaves Bun's parent-process Response class in a state where subsequent endpoints throw `Expected a Response object, but received '_Response { ... }'`. Every render requires a server restart afterwards. Root cause is in Bun's runtime — not fixable from our code without a major architectural change.
2. **`@asset/...` assets unreachable from producer's sandboxed file server.** Engine resolves asset tokens to absolute paths, but Puppeteer's internal file server only serves files under the project working directory. Background images render as broken `<img>`. The engine's `render.ts` carries a Phase A TODO ("Copy any local assets the template references") that needs implementing on the engine side independently of the server choice.

A Celery + subprocess architecture **structurally avoids #1**: each render runs in its own short-lived process, parent state cannot be polluted. It also fits Vaibhav's daily stack — CraftLee already runs Django + Celery + Redis, with established conventions for `GenerationJob` (image renders) and `SavedRender` (user library) that the new feature mirrors.

### 1.3 Non-goals (Phase A)

| Out of scope | Why |
|---|---|
| Multi-user / per-user quotas | Single admin (Vaibhav, `is_staff=True`). Future expansion via permission widening. |
| End-user-facing reels in the CraftLee mobile app | This is an internal tool for marketing-team workflows. |
| Real-time WebSocket / Django channels | 2-second polling suffices for 5–25 min renders. ASGI deployment + Redis channels layer not justified. |
| Concurrent renders behind a single-render lock (Bun behavior) | Celery worker pool handles concurrency naturally. Multiple renders queue up. |
| Asset copying into project dir (Phase A engine TODO #2 above) | Tracked separately on the engine side. The Django pivot doesn't fix or worsen it. |
| Open-folder action | Server-side, not applicable. The dashboard's existing button gets dropped. |
| Migrating the engine to Python | Engine stays TypeScript. Subprocess boundary is the language boundary. |

---

## 2. Architecture

### 2.1 Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                        co-located machine                               │
│                                                                         │
│  ┌──────────────────────────┐         ┌──────────────────────────┐    │
│  │  CraftLee Django server   │         │  HFrames repo (engine)   │    │
│  │  /CraftLee/server/         │         │  /HFrames/apps/          │    │
│  │                            │         │    marketing-engine/     │    │
│  │  ┌──────────────────┐     │         │                          │    │
│  │  │ apps.reels       │     │         │  templates/              │    │
│  │  │  - models.py     │     │         │  assets/                 │    │
│  │  │  - tasks.py      │ ────┼─────────┼─►  src/cli.ts make ...   │    │
│  │  │    (Celery)      │     │ subproc │     --json-progress       │    │
│  │  │  - engine.py     │     │  bun    │     ↓                    │    │
│  │  │  - views.py      │     │         │  out/<date>/...mp4       │    │
│  │  └──────────────────┘     │         │                          │    │
│  │                            │         │                          │    │
│  │  storage service           │         │                          │    │
│  │  (apps.common.services)   │ ────────┼─►  S3/local upload        │    │
│  └─────────────┬─────────────┘         └──────────────────────────┘    │
│                │                                                        │
│                │ DRF REST + JWT                                         │
│                ▼                                                        │
│  ┌──────────────────────────┐                                          │
│  │  React dashboard          │  serves: /api/reels/, video files       │
│  │  (Vite-built static       │                                         │
│  │   served by Django)       │                                         │
│  └──────────────────────────┘                                          │
└────────────────────────────────────────────────────────────────────────┘
```

**Process model:**
- Django serves HTTP (gunicorn/uvicorn).
- Celery worker pool consumes render tasks from Redis queue.
- Each task spawns a fresh `bun` subprocess; engine writes MP4 to `HFrames/apps/marketing-engine/out/<date>/...`; task uploads to storage and cleans up.
- React dashboard runs in browser, makes REST calls to Django, polls every 2 seconds for in-flight render status.

**Bind / deploy:**
- CraftLee server's existing deployment shape (Docker compose, gunicorn, Celery workers) carries the new app with no infrastructure change.
- HFrames repo bind-mounted or `git clone`d into the deployment image, with Bun + Chrome + ffmpeg installed in the same image.

### 2.2 Engine integration

Engine surface area touched: **one new flag** (`--json-progress`) on `bun src/cli.ts make`, plus the existing `renderJob`'s `onProgress` callback (already shipped in `marketing-engine/v0.1.0-phase-a`). When the flag is present, CLI emits structured JSONL events on stdout; human-readable logs go to stderr so subprocess parsing of stdout stays clean.

Without the flag, behavior is unchanged (current `make` CLI users see the same output). Backward-compatible.

The engine package is **not modified beyond the CLI flag** for the Django pivot itself. Other engine improvements (`@asset/...` file-copying into project dir, render speed optimization) are tracked independently.

### 2.3 Frontend integration

The React dashboard's only changes:
- `src/client/api.ts`: API base URLs change from `/api/...` (Bun) to `/api/reels/...` (Django).
- `src/client/api.ts:subscribeToRender`: rewritten to poll `GET /api/reels/{id}/` every 2 seconds instead of opening an EventSource. Same callback signature, so `app.tsx` and `header.tsx` (timer pill, progress display) unchanged.
- All requests carry `Authorization: Bearer <jwt>`. A minimal login screen, or a redirect to CraftLee's existing admin login, captures the JWT once per session.
- Vite dev proxy points at `:8000` (Django dev server) instead of `:7878` (Bun).

The bun server (`apps/marketing-engine-dashboard/src/server/`) is deleted in Phase 5. The dashboard package becomes client-only.

---

## 3. Components & Models

### 3.1 Django app shape

```
CraftLee/server/apps/reels/
  __init__.py
  apps.py                      # ReelsConfig
  models.py                    # ReelJob
  admin.py                     # Django admin registration
  serializers.py               # ReelJobCreateSerializer, ReelJobReadSerializer
  views.py                     # ViewSets backing /api/reels/*
  urls.py                      # mounted under craftlee/urls.py at /api/reels/
  tasks.py                     # render_reel(job_id), reap_stale_jobs()
  engine.py                    # subprocess wrapper for bun CLI
  permissions.py               # IsStaff, IsCreator
  migrations/
  tests/
    test_models.py
    test_serializers.py
    test_engine.py             # mocked subprocess.Popen
    test_views.py              # DRF APIClient
    test_tasks.py              # eager Celery, mocked engine
    test_smoke.py              # SMOKE_RENDER=1, real bun subprocess
```

Registered in `craftlee/settings.py` `INSTALLED_APPS` alongside the existing `apps.generation`, `apps.library`, etc.

### 3.2 `ReelJob` model

```python
class ReelJob(models.Model):
    STATUS_QUEUED    = "queued"
    STATUS_RUNNING   = "running"
    STATUS_DONE      = "done"
    STATUS_FAILED    = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES   = [
        (STATUS_QUEUED,    "Queued"),
        (STATUS_RUNNING,   "Running"),
        (STATUS_DONE,      "Done"),
        (STATUS_FAILED,    "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    created_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name="reel_jobs")
    spec_json   = models.JSONField()                    # full JobSpec input
    status      = models.CharField(max_length=16, choices=STATUS_CHOICES,
                                   default=STATUS_QUEUED)
    phase       = models.CharField(max_length=32, blank=True)
    progress    = models.FloatField(default=0)          # 0..1
    error       = models.TextField(blank=True)

    video_url   = models.CharField(max_length=500, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)

    created_at  = models.DateTimeField(auto_now_add=True)
    started_at  = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["created_by", "-created_at"]),
            models.Index(fields=["status"]),
        ]
```

Single model for both job execution and output. Mirrors `apps.generation.GenerationJob` shape — same lifecycle, same fields, same admin patterns. A future `SavedReel` (user-facing library, like `apps.library.SavedRender`) would be additive.

### 3.3 URL surface (`/api/reels/`)

| Method | Path | Purpose | Permission |
|---|---|---|---|
| POST | `/api/reels/` | Create + enqueue render job | `IsAuthenticated, IsStaff` |
| GET | `/api/reels/` | List requester's recent jobs | `IsAuthenticated, IsStaff` |
| GET | `/api/reels/{id}/` | Poll job status | `IsAuthenticated, IsStaff, IsCreator` |
| GET | `/api/reels/{id}/file/` | Redirect/stream MP4 | `IsAuthenticated, IsStaff, IsCreator` |
| GET | `/api/reels/templates/` | List engine templates | `IsAuthenticated, IsStaff` |
| GET | `/api/reels/templates/{name}/html/` | Raw template HTML for iframe preview | `IsAuthenticated, IsStaff` |
| GET | `/api/reels/brands/{name}/` | Brand JSON | `IsAuthenticated, IsStaff` |
| GET | `/api/reels/assets/` | List assets | `IsAuthenticated, IsStaff` |
| GET | `/api/reels/assets/file?name=` | Asset file (with traversal guard) | `IsAuthenticated, IsStaff` |

### 3.4 `engine.py` — subprocess wrapper

```python
def render_via_cli(spec: dict, on_progress: Callable[[str, float], None]) -> dict:
    """Spawn `bun src/cli.ts make <spec> --json-progress`, parse JSONL events
    from stdout, return {outputPath, durationMs} on success or raise
    RenderError / RenderTimeout on failure."""
```

- Writes spec to a temp JSON file (`/tmp/reel-job-{uuid}.json`).
- Spawns subprocess with `subprocess.Popen` capturing stdout (parse) and stderr (log on failure only).
- Iterates `proc.stdout.readline()`; for each non-empty line, attempts `json.loads`. On `{type: "progress"}` calls `on_progress(phase, progress)`. On `{type: "done"}` returns its `data`. On `{type: "error"}` raises `RenderError(message)`.
- After stdout EOF, calls `proc.wait(timeout=settings.RENDER_TIMEOUT_SEC)`. Non-zero exit → reads stderr → raises `RenderError(stderr)`. Timeout → kills process tree → raises `RenderTimeout`.
- Cleans up the temp spec file in a `finally`.

### 3.5 `tasks.py` — Celery worker

```python
@shared_task(bind=True, autoretry_for=(OperationalError,), max_retries=3,
             retry_backoff=True)
def render_reel(self, job_id: int) -> None:
    ...

@shared_task
def reap_stale_jobs() -> int:
    """Mark any ReelJob stuck in 'running' for >1h as 'failed'.
    Scheduled via Celery beat every 5 minutes."""
    ...
```

`render_reel` mirrors the existing `apps.generation.tasks.run_generation` shape: load row, set `running`, call `engine.render_via_cli` with an `on_progress` callback that updates `phase`/`progress` fields, upload MP4 via `apps.common.services.storage`, set `done` with `video_url` and `duration_ms`. On exception: set `failed`, store message, re-raise (Celery retry).

Celery beat schedule for `reap_stale_jobs` lives in `craftlee/celery.py` alongside any existing scheduled tasks.

### 3.6 Settings

Additions to `craftlee/settings.py` (or `settings.local`):

```python
HFRAMES_ROOT = os.environ.get("HFRAMES_ROOT", "/srv/HFrames")
HFRAMES_CLI  = os.path.join(HFRAMES_ROOT, "apps/marketing-engine/src/cli.ts")
BUN_PATH     = os.environ.get("BUN_PATH", "/usr/local/bin/bun")
RENDER_TIMEOUT_SEC = int(os.environ.get("RENDER_TIMEOUT_SEC", 30 * 60))
```

---

## 4. Data Flow

### 4.1 Engine CLI contract (`--json-progress`)

```jsonl
{"type":"started","jobId":"<uuid>","durationSeconds":12}
{"type":"progress","phase":"preprocessing","progress":0.05}
{"type":"progress","phase":"capture","progress":0.40}
{"type":"progress","phase":"encode","progress":0.80}
{"type":"progress","phase":"done","progress":1.00}
{"type":"done","data":{"outputPath":"<abs path>","durationMs":312456}}
```

Or on failure:

```jsonl
{"type":"error","message":"@asset/foo.png not found in assets/..."}
```

Implementation in `apps/marketing-engine/src/cli.ts`: when `--json-progress` is present, set `onProgress` on the `renderJob` call to write JSONL events to stdout, route human-readable logs (currently going to stdout) to stderr instead. Without the flag, behavior is identical to today's CLI.

### 4.2 Render flow

```
React              Django views          ReelJob          Celery worker        Engine subprocess
  │                     │                  │                  │                      │
  │ POST /api/reels/    │                  │                  │                      │
  │ ──────────────────► │                  │                  │                      │
  │                     │ validate spec    │                  │                      │
  │                     │ create row(queued)                   │                      │
  │                     │ delay render_reel(id)                │                      │
  │ ◄─ {job_id} ────────│                  │                  │                      │
  │                     │                  │                  │ status=running        │
  │ GET /api/reels/{id} │                  │                  │ subprocess.Popen     │
  │ (every 2s)          │                  │                  │ ─────────────────────►│
  │ ──────────────────► │                  │                  │                      │
  │                     │                  │                  │ {progress, phase}    │
  │                     │                  │                  │ ◄─ JSONL ──────────  │
  │                     │                  │                  │ update phase/progress│
  │ ◄ {phase, progress} │                  │                  │                      │
  │                     │                  │                  │ {type:done, mp4 path}│
  │                     │                  │                  │ ◄────────────────────│
  │                     │                  │                  │ storage.upload(mp4)  │
  │                     │                  │                  │ status=done, video_url│
  │ GET /api/reels/{id} │                  │                  │                      │
  │ ◄ {status:done,     │                  │                  │                      │
  │    video_url:...} ──│                  │                  │                      │
  │ <video src=         │                  │                  │                      │
  │  /api/reels/{id}/   │                  │                  │                      │
  │  file/ >            │                  │                  │                      │
```

Key: view returns `{job_id}` immediately. Celery owns the long work. Polling decouples UI from worker.

### 4.3 Live preview flow

The iframe (`runtime.html`) fetches:
- `GET /api/reels/templates/{name}/html/` — the raw `template.html`
- `GET /api/reels/brands/{name}/` — brand JSON
- `GET /api/reels/assets/file?name=` — asset bytes

These are **synchronous Django views** that read files directly from `HFRAMES_ROOT`. No Celery, no subprocess. The iframe's hydrator + asset resolver run client-side as in the existing dashboard.

Live preview is therefore unchanged in behavior from the bun-server era — only the URLs serving its inputs are different.

### 4.4 React `subscribeToRender` rewrite

```ts
export function subscribeToRender(
  jobId: string,
  onEvent: (ev: RenderEvent) => void,
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const job = await jsonFetch(`/api/reels/${encodeURIComponent(jobId)}/`);
      if (job.status === "running") {
        onEvent({ type: "progress",
                  data: { phase: job.phase, progress: job.progress } });
      } else if (job.status === "done") {
        onEvent({ type: "done",
                  data: { outputFile: job.video_url,
                          durationMs: job.duration_ms } });
        return;
      } else if (job.status === "failed") {
        onEvent({ type: "error", data: { message: job.error } });
        return;
      }
    } catch (err) {
      // transient, just retry
    }
    setTimeout(tick, 2000);
  };
  tick();
  return () => { stopped = true; };
}
```

Same external contract as the existing EventSource version. `app.tsx`, `header.tsx`, the elapsed-time pill — all unchanged.

---

## 5. Error Handling

### 5.1 Engine subprocess
| Failure | Detection | Server action |
|---|---|---|
| Asset/template not found | JSONL `{type:"error",...}` then non-zero exit | `RenderError` → `status=failed`, error text stored |
| Chrome / ffmpeg crash | non-zero exit, no terminal event | read stderr → `RenderError(stderr)` |
| Hang (compositor starvation, deadlock) | `proc.wait(timeout=RENDER_TIMEOUT_SEC)` raises | kill process tree → `status=failed`, error="render timed out" |
| Producer file-server port collision | error event at startup | same as #1 |

### 5.2 Celery / DB
| Failure | Action |
|---|---|
| DB transient error | task `autoretry_for=(OperationalError,)`, max 3 retries, exponential backoff |
| Storage upload fails | retry once; on second fail, `status=failed`, error="storage upload failed: {msg}" — local MP4 retained for ops to retrieve manually |
| Worker disappears mid-task | row stuck at `status=running`. `reap_stale_jobs` (Celery beat, every 5 min) flips `running` rows older than 1h to `failed` with error="worker disappeared" |

### 5.3 Django views
| Failure | Action |
|---|---|
| Invalid JobSpec | DRF serializer 400 with field-level errors |
| Job not found | 404 |
| Wrong owner | 403 (`IsCreator` permission class) |
| Concurrent renders by same user | accepted; queues behind earlier one in Celery (no UI lock) |

### 5.4 File serving
| Case | Response |
|---|---|
| `video_url` is S3 | 302 to signed URL (15 min expiry) |
| `video_url` is local | `FileResponse` streaming |
| File missing on disk | 404 + log warning |

### 5.5 React
| Case | UI |
|---|---|
| Poll request fails | transient banner, exponential backoff, keep trying |
| Job stuck `running` >35 min | banner: "render appears stuck — Retry" |
| Job `failed` | red banner with engine's error message + Retry button |

---

## 6. Testing

### 6.1 Unit (fast, mocked)

In CraftLee `apps/reels/tests/`:

- `test_models.py` — `ReelJob` lifecycle transitions, `Meta.indexes` present.
- `test_serializers.py` — JobSpec validation (required fields, `aspect` enum, `output.formats` constraint). Mirrors engine's Zod schema.
- `test_engine.py` — `engine.render_via_cli` with `subprocess.Popen` patched. Asserts JSONL parse, `on_progress` callback fired with right args, `RenderError` raised on `{type:"error"}` event, `RenderTimeout` on simulated timeout, temp spec file cleaned up.
- `test_views.py` — DRF `APIClient`. Auth required (401 unauthenticated, 403 non-staff), 404 / 403 / 200 paths for each endpoint.
- `test_tasks.py` — `render_reel` with engine mocked, eager Celery (`CELERY_TASK_ALWAYS_EAGER=True`). Verify status transitions, `storage.upload_video` called, error path stores message and re-raises.

### 6.2 Engine CLI test (in HFrames)

In `apps/marketing-engine/tests/`:

- `cli-progress.test.ts` — invoke `bun src/cli.ts make <fixture> --json-progress`, capture stdout + stderr, assert stdout is valid JSONL, contains `started` / `progress` / `done` events, `progress` events monotonic, no human-readable lines on stdout.

### 6.3 Smoke E2E (gated `SMOKE_RENDER=1`)

In `apps/reels/tests/test_smoke.py`:

- Spawns real bun subprocess, runs minimal shayari-reel JobSpec, asserts MP4 produced (`os.path.getsize(outputPath) > 10_000`), `ReelJob.status == "done"`, `video_url` populated (whatever storage backend is configured, S3 or local).
- ~60–90 seconds wall time on a warm machine.
- Skipped in CI by default.

### 6.4 No coverage for
- React polling logic (covered by manual smoke + browser test)
- Celery itself (Celery's own test suite)
- Engine internals (covered in HFrames repo's existing tests)

### 6.5 Static checks

- `python manage.py check` and `python manage.py makemigrations --check` in CraftLee CI.
- `bunx oxlint` and `bunx oxfmt --check` on the engine CLI flag changes.

---

## 7. Phased Delivery

### Phase 1 — Engine CLI flag + Django scaffold (~1 day)
- HFrames `apps/marketing-engine/src/cli.ts`: add `--json-progress`. Engine tests + CLI test.
- CraftLee `apps/reels/`: scaffold (apps.py, models.py, migrations, urls.py stub, INSTALLED_APPS).
- Settings additions for `HFRAMES_ROOT`, `BUN_PATH`, `RENDER_TIMEOUT_SEC`.

End: `python manage.py migrate` creates the table; engine emits structured events; nothing else functional.

### Phase 2 — Render pipeline (~1.5 days)
- `engine.py` subprocess wrapper.
- `tasks.py:render_reel`, `reap_stale_jobs`.
- `views.py`: POST `/api/reels/`, GET `/api/reels/{id}/`, GET `/api/reels/{id}/file/`.
- Storage integration via `apps.common.services.storage`.
- Unit + integration (eager Celery) tests.

End: `curl POST /api/reels/` triggers real render; polling shows progress; MP4 retrievable.

### Phase 3 — Live preview routes (~0.5 day)
- GET `/api/reels/templates/`, `/{name}/html/`, `/api/reels/brands/{name}/`, `/api/reels/assets/`, `/api/reels/assets/file`.
- Path-traversal guards.

End: all dashboard read-side endpoints respond.

### Phase 4 — React frontend pivot (~0.5–1 day)
- `apps/marketing-engine-dashboard/src/client/api.ts`: rewrite URLs + `subscribeToRender`. JWT bearer header.
- Vite dev proxy → CraftLee Django (`:8000`).
- Minimal login screen or redirect to existing CraftLee admin login.
- Browser smoke: end-to-end render with new backend.

End: React dashboard talks to Django end-to-end. Bun server completely unused.

### Phase 5 — Sunset bun server (~0.5 day)
- Delete `apps/marketing-engine-dashboard/src/server/` and `tests/server/`.
- Update `apps/marketing-engine/CLAUDE.md` to reference Django architecture.
- Run full test suites; smoke E2E.
- Tag `marketing-engine/v0.3.0-django-pivot`.

End: clean codebase, working dashboard via Django, no Bun pollution issue.

**Total estimate:** 4–5 days of focused work.

---

## 8. Open Questions

None at spec time. All major decisions resolved:

1. Server location → CraftLee `apps.reels/` (not standalone, not in HFrames).
2. Engine invocation → subprocess from Celery worker.
3. Frontend → reuse React dashboard, repoint URLs.
4. Auth → single admin (`is_staff=True`), JWT.
5. Progress streaming → 2-second polling.
6. Output storage → existing `apps.common.services.storage`.
7. Models → single `ReelJob` (job + output), mirrors `GenerationJob`.

---

## 9. Acceptance Criteria for Phase 1–5 complete

1. `POST /api/reels/` with valid JobSpec returns `{id, status: "queued"}` immediately.
2. Celery worker spawns engine subprocess; `ReelJob.phase`/`progress` updates as render advances.
3. React dashboard polls every 2s, shows phase + percentage in header pill.
4. On completion: `status=done`, `video_url` populated, `<video>` plays in right pane.
5. **Multiple renders in a row work cleanly without server restart** (the headline fix vs Bun).
6. Stale job >1h gets reaped automatically.
7. Auth: only `is_staff=True` users can create renders; non-creator can't access others' jobs.
8. `SMOKE_RENDER=1 python manage.py test apps.reels.tests.test_smoke` produces real H.264 MP4.
9. `git pull upstream main` in HFrames still merges clean (engine surface area changes limited to `--json-progress` flag).
10. CraftLee `python manage.py test` all green.
