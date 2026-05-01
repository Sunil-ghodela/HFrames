# Marketing Engine Django Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bun-server dashboard's render path with a Django + Celery + engine-subprocess pipeline inside CraftLee's existing server, while reusing the React dashboard frontend with minimal changes.

**Architecture:** New Django app `apps/reels/` in `CraftLee/server/`. Renders enqueued via Celery; each task spawns a fresh `bun src/cli.ts make ... --json-progress` subprocess; structured JSONL events on stdout drive `ReelJob.phase`/`progress` updates. React dashboard polls `GET /api/reels/{id}/` every 2 seconds. Subprocess isolation per render structurally avoids the Bun parent-process pollution that motivated this pivot.

**Tech Stack:** Python 3.11, Django (existing CraftLee version), DRF, Celery (existing CraftLee setup), Redis (existing), Bun (TypeScript engine subprocess), Vite + React 18 (existing dashboard frontend).

**Scope:** Implements the Phase A "single admin user" pivot per `2026-05-01-django-server-design.md`. Out of scope: multi-user, end-user-facing reels, Django channels / WebSockets, asset-copying-into-project-dir engine fix (tracked separately).

**Done when:**
1. CraftLee `python manage.py test apps.reels` passes (unit + integration).
2. `POST /api/reels/` with valid JobSpec returns `{id, status: "queued"}`.
3. Celery worker spawns engine subprocess, `ReelJob.phase`/`progress` updates as render advances.
4. React dashboard, repointed at Django, polls and displays progress; renders an MP4 end-to-end.
5. Multiple consecutive renders work without server restart (the headline fix vs Bun).
6. `SMOKE_RENDER=1 python manage.py test apps.reels.tests.test_smoke` produces a real H.264 MP4.
7. `bun run --cwd apps/marketing-engine test` (HFrames) all green; engine surface area changes limited to `--json-progress` flag.
8. `git pull upstream main` in HFrames still merges clean.

---

## File Structure

This plan touches two repos. Tasks are explicit about which.

### HFrames (engine repo)

| Path | Responsibility | Touched in |
|---|---|---|
| `apps/marketing-engine/src/cli.ts` | Existing `make` CLI; gain `--json-progress` flag | Task 1 |
| `apps/marketing-engine/tests/cli-progress.test.ts` | New: assert JSONL stdout under `--json-progress` | Task 1 |
| `apps/marketing-engine/CLAUDE.md` | Updated to reference Django architecture | Task 16 |
| `apps/marketing-engine-dashboard/src/server/` | DELETED — bun server superseded | Task 15 |
| `apps/marketing-engine-dashboard/tests/server/` | DELETED — bun server tests superseded | Task 15 |
| `apps/marketing-engine-dashboard/src/client/api.ts` | Rewritten URLs + polling-based `subscribeToRender` | Task 12 |
| `apps/marketing-engine-dashboard/src/client/main.tsx` | Add JWT bearer header / login flow | Task 13 |
| `apps/marketing-engine-dashboard/vite.config.ts` | Dev proxy → CraftLee Django `:8000` | Task 14 |

### CraftLee (server repo at `/home/vaibhav/AI/Jan-April.../CraftLee/server/`)

| Path | Responsibility | Touched in |
|---|---|---|
| `apps/reels/__init__.py` | App package marker | Task 2 |
| `apps/reels/apps.py` | `ReelsConfig` | Task 2 |
| `apps/reels/models.py` | `ReelJob` model | Task 2 |
| `apps/reels/migrations/0001_initial.py` | Generated migration | Task 2 |
| `apps/reels/admin.py` | Django admin registration | Task 2 |
| `apps/reels/serializers.py` | DRF serializers (create + read) | Task 5 |
| `apps/reels/permissions.py` | `IsCreator` permission class | Task 6 |
| `apps/reels/views.py` | All `/api/reels/*` endpoints | Tasks 6, 8-11 |
| `apps/reels/urls.py` | URL routing | Tasks 2, 6, 8-11 |
| `apps/reels/engine.py` | `render_via_cli()` subprocess wrapper | Task 3 |
| `apps/reels/tasks.py` | `render_reel`, `reap_stale_jobs` Celery tasks | Tasks 4, 7 |
| `apps/reels/tests/test_models.py` | `ReelJob` lifecycle tests | Task 2 |
| `apps/reels/tests/test_engine.py` | subprocess wrapper, mocked | Task 3 |
| `apps/reels/tests/test_tasks.py` | Celery eager + mocked engine | Task 4 |
| `apps/reels/tests/test_serializers.py` | JobSpec validation | Task 5 |
| `apps/reels/tests/test_views.py` | DRF APIClient lifecycle | Tasks 6, 8-11 |
| `apps/reels/tests/test_smoke.py` | `SMOKE_RENDER=1` real subprocess | Task 16 |
| `craftlee/settings.py` | `HFRAMES_ROOT`, `BUN_PATH`, `RENDER_TIMEOUT_SEC`, INSTALLED_APPS | Task 2, Task 7 (beat schedule) |
| `craftlee/urls.py` | Mount `apps.reels.urls` at `/api/reels/` | Task 2 |
| `craftlee/celery.py` | `beat_schedule` for `reap_stale_jobs` | Task 7 |
| `apps/common/services/storage.py` | (Verify or extend) `upload_bytes` accepts mp4 | Task 4 (verify only) |

---

## Prerequisites (one-time, before any task)

- [ ] **Step P1: Verify HFrames baseline green**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
bun install
bun run --cwd apps/marketing-engine test
```

Expected: 27 tests pass, 1 skipped. No regressions from `marketing-engine/v0.2.0-dashboard-mvp`.

- [ ] **Step P2: Verify CraftLee baseline green**

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
# Activate virtualenv (whatever the project uses — check requirements.txt or README)
python manage.py test
```

Expected: existing test suite passes. (If failures pre-date this work, capture them in a note and proceed; do not fix unrelated tests in this plan.)

- [ ] **Step P3: Confirm Bun + Chrome + ffmpeg installed on the machine that will run Celery**

```bash
which bun && bun --version
which ffmpeg && ffmpeg -version | head -1
ls ~/.cache/puppeteer/chrome/ 2>/dev/null || bunx puppeteer browsers install chrome
```

All three must be available. The exact `bun` path will become `BUN_PATH` in CraftLee settings.

- [ ] **Step P4: Confirm `apps.common.services.storage` is importable**

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
python -c "from apps.common.services import storage; print(storage.upload_bytes.__doc__ or 'OK')"
```

Expected: prints `OK` (or the docstring). If the import fails, the storage service has moved — locate it and update the plan's import paths in Task 4 before proceeding.

---

## Task 1: Engine CLI `--json-progress` flag

**Repo:** HFrames

Add a `--json-progress` flag to `apps/marketing-engine/src/cli.ts`'s `make` command. When present: emit one JSON event per line on stdout (`started`, `progress`, `done`, `error`); send all human-readable logs to stderr. Without the flag: behavior unchanged.

**Files:**
- Modify: `apps/marketing-engine/src/cli.ts`
- Create: `apps/marketing-engine/tests/cli-progress.test.ts`

- [ ] **Step 1: Read the current CLI to understand the make command shape**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
sed -n '1,120p' apps/marketing-engine/src/cli.ts
```

Note where the `make` subcommand calls `renderJob`, what arguments it constructs, and where output currently goes (likely `console.log` to stdout).

- [ ] **Step 2: Write the failing test**

Create `apps/marketing-engine/tests/cli-progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "src/cli.ts");

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", [CLI, ...args], { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

describe("cli --json-progress", () => {
  it("emits JSONL events on stdout for shayari-reel minimal fixture", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "reel-spec-"));
    const specPath = join(tmp, "job.json");
    writeFileSync(
      specPath,
      JSON.stringify({
        template: "shayari-reel",
        app: "craftlee",
        aspect: "9:16",
        duration: 3,
        output: { name: "json-progress-test", formats: ["mp4"] },
        vars: { shayariLines: ["line one", "line two"] },
      }),
    );

    const { stdout, stderr, code } = await runCli(["make", specPath, "--json-progress"]);

    expect(code).toBe(0);

    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);

    const events = lines.map((l) => JSON.parse(l));
    const types = events.map((e) => e.type);
    expect(types).toContain("started");
    expect(types[types.length - 1]).toBe("done");

    const done = events[events.length - 1];
    expect(done.data.outputPath).toMatch(/\.mp4$/);
    expect(typeof done.data.durationMs).toBe("number");

    // Human logs must NOT appear on stdout
    expect(stdout).not.toMatch(/\[Compiler\]|\[INFO\]|\[WARN\]/);
    // They MAY appear on stderr (or be silenced — either is OK)
  }, 120_000);

  it("without --json-progress, stdout has human logs (legacy behavior)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "reel-spec-"));
    const specPath = join(tmp, "job.json");
    writeFileSync(
      specPath,
      JSON.stringify({
        template: "shayari-reel",
        app: "craftlee",
        aspect: "9:16",
        duration: 3,
        output: { name: "legacy-test", formats: ["mp4"] },
        vars: { shayariLines: ["a", "b"] },
      }),
    );
    const { stdout, code } = await runCli(["make", specPath]);
    expect(code).toBe(0);
    // Should contain human-readable text, not parseable as JSON
    let allJson = true;
    for (const line of stdout.split("\n").filter((l) => l.trim())) {
      try {
        JSON.parse(line);
      } catch {
        allJson = false;
        break;
      }
    }
    expect(allJson).toBe(false);
  }, 120_000);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --cwd apps/marketing-engine test tests/cli-progress.test.ts
```

Expected: FAIL — the `--json-progress` flag is not yet implemented. The test runs the real engine end-to-end (~30-90 s wall time depending on machine).

> **Note for slow machines:** if test runtime exceeds the 120s timeout, raise the timeout in the test and proceed; CI behavior is the same.

- [ ] **Step 4: Implement `--json-progress`**

Modify `apps/marketing-engine/src/cli.ts`:

```ts
// Inside the `make` subcommand definition (find the citty defineCommand block).
// Add `jsonProgress` to args/flags:

args: {
  // ... existing args ...
  "json-progress": {
    type: "boolean",
    description: "Emit structured JSONL progress events on stdout; human logs go to stderr",
    default: false,
  },
},

run: async (ctx) => {
  const jsonProgress = !!ctx.args["json-progress"];

  // ... existing spec loading code ...

  if (jsonProgress) {
    // Redirect human-readable info logs to stderr so stdout stays clean for JSONL
    const origLog = console.log;
    console.log = (...a: unknown[]) => console.error(...a);

    try {
      const startedEvent = {
        type: "started",
        jobId: `${job.output.name}-${Date.now()}`,
        durationSeconds: job.duration ?? bundle.schema.defaultDuration,
      };
      process.stdout.write(JSON.stringify(startedEvent) + "\n");

      const result = await renderJob({
        job,
        html,
        outDir,
        rootDir,
        onProgress: (ev) => {
          process.stdout.write(JSON.stringify({ type: "progress", phase: ev.phase, progress: ev.progress }) + "\n");
        },
      });

      const doneEvent = {
        type: "done",
        data: { outputPath: result.outputPath, durationMs: result.durationMs },
      };
      process.stdout.write(JSON.stringify(doneEvent) + "\n");
    } catch (err) {
      const errEvent = {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      process.stdout.write(JSON.stringify(errEvent) + "\n");
      process.exit(1);
    } finally {
      console.log = origLog;
    }
    return;
  }

  // ... existing non-JSON behavior unchanged ...
};
```

The exact insertion point depends on the existing `make` command structure; preserve the legacy code path verbatim under `else`.

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run --cwd apps/marketing-engine test tests/cli-progress.test.ts
```

Expected: PASS. Both tests green.

- [ ] **Step 6: Run full engine test suite to verify no regression**

```bash
bun run --cwd apps/marketing-engine test
```

Expected: 29 passed (27 existing + 2 new), 1 skipped (smoke).

- [ ] **Step 7: Lint + format**

```bash
bunx oxlint apps/marketing-engine/src/cli.ts apps/marketing-engine/tests/cli-progress.test.ts
bunx oxfmt apps/marketing-engine/src/cli.ts apps/marketing-engine/tests/cli-progress.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/marketing-engine/src/cli.ts apps/marketing-engine/tests/cli-progress.test.ts
git commit -m "feat(marketing-engine): add --json-progress flag to make cli"
```

---

## Task 2: CraftLee `apps/reels/` scaffold + `ReelJob` model

**Repo:** CraftLee/server

Scaffold the Django app skeleton, define the `ReelJob` model, add a migration, register the app in `INSTALLED_APPS`, and mount empty URL routes.

**Files:**
- Create: `apps/reels/__init__.py`
- Create: `apps/reels/apps.py`
- Create: `apps/reels/models.py`
- Create: `apps/reels/admin.py`
- Create: `apps/reels/urls.py`
- Create: `apps/reels/tests/__init__.py`
- Create: `apps/reels/tests/test_models.py`
- Create: `apps/reels/migrations/__init__.py`
- Modify: `craftlee/settings.py` (INSTALLED_APPS + new settings)
- Modify: `craftlee/urls.py` (mount `/api/reels/`)

- [ ] **Step 1: Create the package files**

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
mkdir -p apps/reels/migrations apps/reels/tests
touch apps/reels/__init__.py apps/reels/migrations/__init__.py apps/reels/tests/__init__.py
```

- [ ] **Step 2: Create `apps/reels/apps.py`**

```python
from django.apps import AppConfig


class ReelsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.reels"
    label = "reels"
```

- [ ] **Step 3: Write the failing test for `ReelJob` lifecycle**

Create `apps/reels/tests/test_models.py`:

```python
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.reels.models import ReelJob


class ReelJobModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="staff",
            password="x",
            is_staff=True,
        )
        self.spec = {
            "template": "shayari-reel",
            "app": "craftlee",
            "aspect": "9:16",
            "output": {"name": "test", "formats": ["mp4"]},
            "vars": {"shayariLines": ["a", "b"]},
        }

    def test_default_status_is_queued(self):
        job = ReelJob.objects.create(created_by=self.user, spec_json=self.spec)
        self.assertEqual(job.status, ReelJob.STATUS_QUEUED)
        self.assertEqual(job.progress, 0)
        self.assertEqual(job.phase, "")
        self.assertEqual(job.error, "")
        self.assertEqual(job.video_url, "")
        self.assertIsNone(job.duration_ms)
        self.assertIsNotNone(job.created_at)
        self.assertIsNone(job.started_at)
        self.assertIsNone(job.finished_at)

    def test_status_transitions(self):
        job = ReelJob.objects.create(created_by=self.user, spec_json=self.spec)
        job.status = ReelJob.STATUS_RUNNING
        job.phase = "capture"
        job.progress = 0.4
        job.save()
        job.refresh_from_db()
        self.assertEqual(job.status, "running")
        self.assertEqual(job.phase, "capture")
        self.assertAlmostEqual(job.progress, 0.4)

    def test_indexes_present(self):
        meta = ReelJob._meta
        index_field_lists = [list(idx.fields) for idx in meta.indexes]
        self.assertIn(["created_by", "-created_at"], index_field_lists)
        self.assertIn(["status"], index_field_lists)

    def test_ordering_default(self):
        ReelJob.objects.create(created_by=self.user, spec_json=self.spec)
        ReelJob.objects.create(created_by=self.user, spec_json=self.spec)
        # No specific ordering required; just ensure the table is queryable
        self.assertEqual(ReelJob.objects.count(), 2)
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
python manage.py test apps.reels.tests.test_models -v 2
```

Expected: FAIL — `apps.reels.models` cannot be imported.

- [ ] **Step 5: Implement `apps/reels/models.py`**

```python
from django.conf import settings
from django.db import models


class ReelJob(models.Model):
    STATUS_QUEUED = "queued"
    STATUS_RUNNING = "running"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_QUEUED, "Queued"),
        (STATUS_RUNNING, "Running"),
        (STATUS_DONE, "Done"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reel_jobs",
    )
    spec_json = models.JSONField()
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_QUEUED,
    )
    phase = models.CharField(max_length=32, blank=True)
    progress = models.FloatField(default=0)
    error = models.TextField(blank=True)

    video_url = models.CharField(max_length=500, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["created_by", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin only
        return f"ReelJob({self.id}, {self.status})"
```

- [ ] **Step 6: Register the app**

Edit `craftlee/settings.py` — add `"apps.reels"` to `INSTALLED_APPS` after `"apps.uploads"`:

```python
INSTALLED_APPS = [
    # ... existing ...
    "apps.uploads",
    "apps.reels",
]
```

Add new settings at the bottom (or in a clearly-marked section):

```python
import os as _os

HFRAMES_ROOT = _os.environ.get(
    "HFRAMES_ROOT",
    "/home/vaibhav/AI/Jan-April.../HFrames",
)
HFRAMES_CLI = _os.path.join(HFRAMES_ROOT, "apps/marketing-engine/src/cli.ts")
BUN_PATH = _os.environ.get("BUN_PATH", "/home/vaibhav/.bun/bin/bun")
RENDER_TIMEOUT_SEC = int(_os.environ.get("RENDER_TIMEOUT_SEC", str(30 * 60)))
```

> **Verify** that `BUN_PATH` matches what `which bun` returned in P3. Adjust if different. The default is the per-user install location `~/.bun/bin/bun`.

- [ ] **Step 7: Generate the migration**

```bash
python manage.py makemigrations reels
```

Expected output: `Migrations for 'reels': apps/reels/migrations/0001_initial.py - Create model ReelJob`

- [ ] **Step 8: Apply migration**

```bash
python manage.py migrate reels
```

Expected: `Applying reels.0001_initial... OK`.

- [ ] **Step 9: Run the test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_models -v 2
```

Expected: 4 tests pass.

- [ ] **Step 10: Mount `/api/reels/` URL stub**

Create `apps/reels/urls.py`:

```python
from django.urls import path

app_name = "reels"

urlpatterns: list = []  # filled in by later tasks
```

Edit `craftlee/urls.py` — add to the URL list (alongside other API mounts):

```python
path("api/reels/", include("apps.reels.urls", namespace="reels")),
```

- [ ] **Step 11: Register `ReelJob` in admin**

Create `apps/reels/admin.py`:

```python
from django.contrib import admin

from .models import ReelJob


@admin.register(ReelJob)
class ReelJobAdmin(admin.ModelAdmin):
    list_display = ("id", "created_by", "status", "phase", "progress", "created_at")
    list_filter = ("status",)
    search_fields = ("created_by__username", "id")
    readonly_fields = ("created_at", "started_at", "finished_at")
```

- [ ] **Step 12: Run full CraftLee test suite to verify nothing else broke**

```bash
python manage.py test
```

Expected: existing tests still pass, plus 4 new from `apps.reels.tests.test_models`.

- [ ] **Step 13: Commit**

```bash
git add apps/reels/ craftlee/settings.py craftlee/urls.py
git commit -m "feat(reels): scaffold app, ReelJob model, migration, settings"
```

---

## Task 3: `engine.py` subprocess wrapper

**Repo:** CraftLee/server

A pure Python wrapper that spawns the engine CLI, parses JSONL events from stdout, and returns the final result or raises a typed exception. No Django, no Celery — easy to unit-test with `subprocess.Popen` mocked.

**Files:**
- Create: `apps/reels/engine.py`
- Create: `apps/reels/tests/test_engine.py`

- [ ] **Step 1: Write the failing test**

Create `apps/reels/tests/test_engine.py`:

```python
import json
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from apps.reels import engine


class StubProc:
    """A fake subprocess.Popen-shaped object for tests."""

    def __init__(self, stdout_lines, stderr_text="", returncode=0):
        self._stdout_lines = list(stdout_lines)
        self._idx = 0
        self.stdout = self
        self.stderr = MagicMock()
        self.stderr.read.return_value = stderr_text
        self.returncode = returncode
        self.killed = False

    def readline(self):
        if self._idx >= len(self._stdout_lines):
            return ""
        line = self._stdout_lines[self._idx]
        self._idx += 1
        return line

    def wait(self, timeout=None):  # noqa: ARG002
        return self.returncode

    def kill(self):
        self.killed = True


@override_settings(BUN_PATH="/fake/bun", HFRAMES_CLI="/fake/cli.ts", RENDER_TIMEOUT_SEC=60)
class RenderViaCliTests(TestCase):
    def setUp(self):
        self.spec = {
            "template": "shayari-reel",
            "app": "craftlee",
            "aspect": "9:16",
            "output": {"name": "x", "formats": ["mp4"]},
            "vars": {"shayariLines": ["a", "b"]},
        }

    def test_happy_path_emits_progress_then_returns_done(self):
        events = [
            json.dumps({"type": "started", "jobId": "j1", "durationSeconds": 12}) + "\n",
            json.dumps({"type": "progress", "phase": "preprocessing", "progress": 0.05}) + "\n",
            json.dumps({"type": "progress", "phase": "capture", "progress": 0.5}) + "\n",
            json.dumps({"type": "done", "data": {"outputPath": "/tmp/out.mp4", "durationMs": 1234}}) + "\n",
        ]
        proc = StubProc(events, returncode=0)
        progresses: list[tuple[str, float]] = []

        with patch("apps.reels.engine.subprocess.Popen", return_value=proc):
            result = engine.render_via_cli(self.spec, lambda phase, p: progresses.append((phase, p)))

        self.assertEqual(result, {"outputPath": "/tmp/out.mp4", "durationMs": 1234})
        self.assertEqual(progresses, [("preprocessing", 0.05), ("capture", 0.5)])

    def test_error_event_raises_render_error(self):
        events = [
            json.dumps({"type": "started", "jobId": "j1"}) + "\n",
            json.dumps({"type": "error", "message": "@asset/foo.png not found"}) + "\n",
        ]
        proc = StubProc(events, returncode=1, stderr_text="stack trace")

        with patch("apps.reels.engine.subprocess.Popen", return_value=proc):
            with self.assertRaisesMessage(engine.RenderError, "@asset/foo.png not found"):
                engine.render_via_cli(self.spec, lambda *_: None)

    def test_nonzero_exit_without_error_event_raises_with_stderr(self):
        events = [json.dumps({"type": "started", "jobId": "j1"}) + "\n"]  # no done/error
        proc = StubProc(events, returncode=2, stderr_text="chrome crashed")

        with patch("apps.reels.engine.subprocess.Popen", return_value=proc):
            with self.assertRaisesMessage(engine.RenderError, "chrome crashed"):
                engine.render_via_cli(self.spec, lambda *_: None)

    def test_timeout_kills_process(self):
        proc = StubProc([], returncode=0)

        def raise_timeout(timeout=None):  # noqa: ARG001
            raise __import__("subprocess").TimeoutExpired(cmd="bun", timeout=60)

        proc.wait = raise_timeout

        with patch("apps.reels.engine.subprocess.Popen", return_value=proc):
            with self.assertRaises(engine.RenderTimeout):
                engine.render_via_cli(self.spec, lambda *_: None)
        self.assertTrue(proc.killed)

    def test_non_json_lines_are_ignored(self):
        events = [
            "not json at all\n",
            json.dumps({"type": "progress", "phase": "capture", "progress": 0.5}) + "\n",
            json.dumps({"type": "done", "data": {"outputPath": "/x.mp4", "durationMs": 1}}) + "\n",
        ]
        proc = StubProc(events, returncode=0)
        progresses: list[tuple[str, float]] = []

        with patch("apps.reels.engine.subprocess.Popen", return_value=proc):
            result = engine.render_via_cli(self.spec, lambda phase, p: progresses.append((phase, p)))

        self.assertEqual(result["outputPath"], "/x.mp4")
        self.assertEqual(progresses, [("capture", 0.5)])
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_engine -v 2
```

Expected: FAIL — `apps.reels.engine` cannot be imported.

- [ ] **Step 3: Implement `apps/reels/engine.py`**

```python
"""Subprocess wrapper around the HFrames bun CLI.

Spawns `bun src/cli.ts make <spec> --json-progress`, parses JSONL events
from stdout, drives an `on_progress(phase, progress)` callback as events
arrive, and returns {outputPath, durationMs} on success.

Raises RenderError on engine-reported failures or non-zero exit, and
RenderTimeout if the subprocess exceeds RENDER_TIMEOUT_SEC.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import uuid
from typing import Callable

from django.conf import settings


class RenderError(Exception):
    """Render failed. Message contains the engine error or stderr text."""


class RenderTimeout(Exception):
    """Render exceeded RENDER_TIMEOUT_SEC. Process tree was killed."""


def render_via_cli(
    spec: dict,
    on_progress: Callable[[str, float], None],
) -> dict:
    spec_path = _write_temp_spec(spec)
    try:
        proc = subprocess.Popen(
            [settings.BUN_PATH, settings.HFRAMES_CLI, "make", spec_path, "--json-progress"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        result: dict | None = None
        error_message: str | None = None

        for line in iter(proc.stdout.readline, ""):
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            ev_type = ev.get("type")
            if ev_type == "progress":
                phase = ev.get("phase", "")
                progress = float(ev.get("progress", 0))
                on_progress(phase, progress)
            elif ev_type == "done":
                result = ev.get("data", {})
            elif ev_type == "error":
                error_message = ev.get("message", "")

        try:
            proc.wait(timeout=settings.RENDER_TIMEOUT_SEC)
        except subprocess.TimeoutExpired:
            proc.kill()
            raise RenderTimeout(f"render exceeded {settings.RENDER_TIMEOUT_SEC}s")

        if error_message is not None:
            raise RenderError(error_message)
        if proc.returncode != 0:
            stderr_text = proc.stderr.read() or f"exit code {proc.returncode}"
            raise RenderError(stderr_text.strip())
        if result is None:
            raise RenderError("engine produced no done event before exiting")
        return result
    finally:
        try:
            os.unlink(spec_path)
        except OSError:
            pass


def _write_temp_spec(spec: dict) -> str:
    fd, path = tempfile.mkstemp(prefix=f"reel-job-{uuid.uuid4().hex}-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(spec, f)
    except Exception:
        os.unlink(path)
        raise
    return path
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_engine -v 2
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/reels/engine.py apps/reels/tests/test_engine.py
git commit -m "feat(reels): subprocess wrapper for engine cli"
```

---

## Task 4: `tasks.py` — `render_reel` Celery task

**Repo:** CraftLee/server

The Celery task that orchestrates a render: load row, transition to running, call `engine.render_via_cli`, upload MP4 via existing storage service, transition to done. Errors transition to failed and re-raise so Celery records the exception.

**Files:**
- Create: `apps/reels/tasks.py`
- Create: `apps/reels/tests/test_tasks.py`

- [ ] **Step 1: Verify storage service signature**

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
grep -A 8 "^def upload" apps/common/services/storage.py | head -30
```

Confirm `upload_bytes(data, prefix, ext, content_type)` is callable. We'll invoke it with `ext="mp4"`, `content_type="video/mp4"`. If a higher-level `upload_video` already exists, prefer it; otherwise call `upload_bytes` directly.

- [ ] **Step 2: Write the failing test**

Create `apps/reels/tests/test_tasks.py`:

```python
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.reels import tasks
from apps.reels.engine import RenderError, RenderTimeout
from apps.reels.models import ReelJob


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class RenderReelTaskTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.spec = {
            "template": "shayari-reel",
            "app": "craftlee",
            "aspect": "9:16",
            "output": {"name": "test", "formats": ["mp4"]},
            "vars": {"shayariLines": ["a", "b"]},
        }
        self.job = ReelJob.objects.create(created_by=self.user, spec_json=self.spec)

    def test_happy_path_transitions_through_running_to_done(self):
        def fake_render(spec, on_progress):
            on_progress("preprocessing", 0.05)
            on_progress("capture", 0.5)
            return {"outputPath": "/tmp/out.mp4", "durationMs": 1234}

        with patch("apps.reels.tasks.engine.render_via_cli", side_effect=fake_render), \
             patch("apps.reels.tasks._upload_mp4", return_value="https://cdn/x.mp4"):
            tasks.render_reel(self.job.id)

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, ReelJob.STATUS_DONE)
        self.assertEqual(self.job.video_url, "https://cdn/x.mp4")
        self.assertEqual(self.job.duration_ms, 1234)
        self.assertIsNotNone(self.job.started_at)
        self.assertIsNotNone(self.job.finished_at)

    def test_render_error_transitions_to_failed_and_raises(self):
        with patch(
            "apps.reels.tasks.engine.render_via_cli",
            side_effect=RenderError("something broke"),
        ):
            with self.assertRaises(RenderError):
                tasks.render_reel(self.job.id)

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, ReelJob.STATUS_FAILED)
        self.assertIn("something broke", self.job.error)
        self.assertIsNotNone(self.job.finished_at)

    def test_render_timeout_transitions_to_failed(self):
        with patch(
            "apps.reels.tasks.engine.render_via_cli",
            side_effect=RenderTimeout("over 30 min"),
        ):
            with self.assertRaises(RenderTimeout):
                tasks.render_reel(self.job.id)

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, ReelJob.STATUS_FAILED)
        self.assertIn("over 30 min", self.job.error)

    def test_progress_callback_updates_phase_and_progress(self):
        def fake_render(spec, on_progress):
            on_progress("capture", 0.4)
            # Verify the row was updated by the time we get here
            row = ReelJob.objects.get(pk=self.job.id)
            assert row.phase == "capture"
            assert abs(row.progress - 0.4) < 0.01
            return {"outputPath": "/tmp/out.mp4", "durationMs": 1}

        with patch("apps.reels.tasks.engine.render_via_cli", side_effect=fake_render), \
             patch("apps.reels.tasks._upload_mp4", return_value="x"):
            tasks.render_reel(self.job.id)
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_tasks -v 2
```

Expected: FAIL — `apps.reels.tasks` not found.

- [ ] **Step 4: Implement `apps/reels/tasks.py`**

```python
"""Celery tasks for reel rendering."""

from __future__ import annotations

from celery import shared_task
from django.utils import timezone

from apps.common.services import storage

from . import engine
from .models import ReelJob


@shared_task(bind=True)
def render_reel(self, job_id: int) -> None:
    job = ReelJob.objects.get(pk=job_id)
    job.status = ReelJob.STATUS_RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at"])

    def on_progress(phase: str, progress: float) -> None:
        ReelJob.objects.filter(pk=job_id).update(phase=phase, progress=progress)

    try:
        result = engine.render_via_cli(job.spec_json, on_progress)
        video_url = _upload_mp4(result["outputPath"])

        job.video_url = video_url
        job.duration_ms = int(result.get("durationMs") or 0)
        job.status = ReelJob.STATUS_DONE
        job.phase = "done"
        job.progress = 1.0
        job.finished_at = timezone.now()
        job.save()
    except (engine.RenderError, engine.RenderTimeout) as exc:
        job.status = ReelJob.STATUS_FAILED
        job.error = str(exc)[:2000]
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error", "finished_at"])
        raise
    except Exception as exc:  # unexpected; record and re-raise for Celery retry visibility
        job.status = ReelJob.STATUS_FAILED
        job.error = f"unexpected: {exc!s}"[:2000]
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error", "finished_at"])
        raise


def _upload_mp4(path: str) -> str:
    """Read MP4 file from local engine output path, upload via storage service,
    return the public URL. Separated out for ease of mocking in tests."""
    with open(path, "rb") as f:
        data = f.read()
    return storage.upload_bytes(data, prefix="reels", ext="mp4", content_type="video/mp4")
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_tasks -v 2
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/reels/tasks.py apps/reels/tests/test_tasks.py
git commit -m "feat(reels): render_reel celery task"
```

---

## Task 5: `serializers.py` — JobSpec validation

**Repo:** CraftLee/server

DRF serializers that validate the input spec mirrors the engine's Zod schema. Reading shape (`ReelJobReadSerializer`) shapes the polling response.

**Files:**
- Create: `apps/reels/serializers.py`
- Create: `apps/reels/tests/test_serializers.py`

- [ ] **Step 1: Write the failing test**

Create `apps/reels/tests/test_serializers.py`:

```python
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.reels.models import ReelJob
from apps.reels.serializers import ReelJobCreateSerializer, ReelJobReadSerializer


class ReelJobCreateSerializerTests(TestCase):
    def _valid_spec(self):
        return {
            "template": "shayari-reel",
            "app": "craftlee",
            "aspect": "9:16",
            "output": {"name": "test", "formats": ["mp4"]},
            "vars": {"shayariLines": ["a", "b"]},
        }

    def test_valid_spec_passes(self):
        s = ReelJobCreateSerializer(data={"spec_json": self._valid_spec()})
        self.assertTrue(s.is_valid(), s.errors)

    def test_missing_template_rejected(self):
        spec = self._valid_spec()
        del spec["template"]
        s = ReelJobCreateSerializer(data={"spec_json": spec})
        self.assertFalse(s.is_valid())
        self.assertIn("spec_json", s.errors)

    def test_invalid_aspect_rejected(self):
        spec = self._valid_spec()
        spec["aspect"] = "21:9"
        s = ReelJobCreateSerializer(data={"spec_json": spec})
        self.assertFalse(s.is_valid())

    def test_output_formats_must_contain_mp4(self):
        spec = self._valid_spec()
        spec["output"]["formats"] = ["webm"]
        s = ReelJobCreateSerializer(data={"spec_json": spec})
        self.assertFalse(s.is_valid())

    def test_app_must_be_known(self):
        spec = self._valid_spec()
        spec["app"] = "unknown-brand"
        s = ReelJobCreateSerializer(data={"spec_json": spec})
        self.assertFalse(s.is_valid())


class ReelJobReadSerializerTests(TestCase):
    def test_serializes_relevant_fields(self):
        user = get_user_model().objects.create_user(username="x", password="x", is_staff=True)
        job = ReelJob.objects.create(
            created_by=user,
            spec_json={"template": "shayari-reel"},
            status=ReelJob.STATUS_RUNNING,
            phase="capture",
            progress=0.4,
        )
        data = ReelJobReadSerializer(job).data
        self.assertEqual(data["id"], job.id)
        self.assertEqual(data["status"], "running")
        self.assertEqual(data["phase"], "capture")
        self.assertAlmostEqual(data["progress"], 0.4)
        self.assertIn("created_at", data)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_serializers -v 2
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/reels/serializers.py`**

```python
from rest_framework import serializers

from .models import ReelJob


KNOWN_ASPECTS = {"9:16", "1:1", "16:9"}
KNOWN_APPS = {"craftlee", "reelvoice"}
REQUIRED_OUTPUT_FORMAT = "mp4"


class ReelJobCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReelJob
        fields = ("spec_json",)

    def validate_spec_json(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("spec_json must be an object")

        for required in ("template", "app", "aspect", "output", "vars"):
            if required not in value:
                raise serializers.ValidationError(f"missing required field '{required}'")

        if value["app"] not in KNOWN_APPS:
            raise serializers.ValidationError(
                f"unknown app '{value['app']}' (expected one of {sorted(KNOWN_APPS)})"
            )

        if value["aspect"] not in KNOWN_ASPECTS:
            raise serializers.ValidationError(
                f"invalid aspect '{value['aspect']}' (expected one of {sorted(KNOWN_ASPECTS)})"
            )

        out = value.get("output")
        if not isinstance(out, dict):
            raise serializers.ValidationError("output must be an object")
        if "name" not in out or not out["name"]:
            raise serializers.ValidationError("output.name is required")
        formats = out.get("formats", [])
        if not isinstance(formats, list) or REQUIRED_OUTPUT_FORMAT not in formats:
            raise serializers.ValidationError(
                f"output.formats must include '{REQUIRED_OUTPUT_FORMAT}'"
            )

        if not isinstance(value.get("vars"), dict):
            raise serializers.ValidationError("vars must be an object")

        return value


class ReelJobReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReelJob
        fields = (
            "id",
            "status",
            "phase",
            "progress",
            "error",
            "video_url",
            "duration_ms",
            "spec_json",
            "created_at",
            "started_at",
            "finished_at",
        )
        read_only_fields = fields
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_serializers -v 2
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/reels/serializers.py apps/reels/tests/test_serializers.py
git commit -m "feat(reels): jobspec validation serializers"
```

---

## Task 6: `views.py` + `urls.py` — render endpoints

**Repo:** CraftLee/server

POST `/api/reels/`, GET `/api/reels/`, GET `/api/reels/{id}/`, GET `/api/reels/{id}/file/`. Auth: `IsAuthenticated` + `is_staff=True`. `IsCreator` for the per-job endpoints.

**Files:**
- Create: `apps/reels/permissions.py`
- Create: `apps/reels/views.py`
- Modify: `apps/reels/urls.py`
- Create: `apps/reels/tests/test_views.py`

- [ ] **Step 1: Write the failing test**

Create `apps/reels/tests/test_views.py`:

```python
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.reels.models import ReelJob


def make_user(*, staff: bool = True, username: str = "u"):
    return get_user_model().objects.create_user(
        username=username,
        password="x",
        is_staff=staff,
    )


class ReelsRenderEndpointsTests(TestCase):
    def setUp(self):
        self.staff = make_user(staff=True, username="staff")
        self.other_staff = make_user(staff=True, username="other")
        self.non_staff = make_user(staff=False, username="member")
        self.client = APIClient()
        self.spec = {
            "template": "shayari-reel",
            "app": "craftlee",
            "aspect": "9:16",
            "output": {"name": "x", "formats": ["mp4"]},
            "vars": {"shayariLines": ["a", "b"]},
        }

    # -------- POST /api/reels/ --------

    def test_create_unauthenticated_401(self):
        res = self.client.post("/api/reels/", {"spec_json": self.spec}, format="json")
        self.assertEqual(res.status_code, 401)

    def test_create_non_staff_403(self):
        self.client.force_authenticate(self.non_staff)
        res = self.client.post("/api/reels/", {"spec_json": self.spec}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_create_invalid_spec_400(self):
        self.client.force_authenticate(self.staff)
        bad = dict(self.spec)
        del bad["template"]
        res = self.client.post("/api/reels/", {"spec_json": bad}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_create_valid_returns_job_id_and_dispatches_task(self):
        self.client.force_authenticate(self.staff)
        with patch("apps.reels.views.render_reel") as task_mock:
            res = self.client.post("/api/reels/", {"spec_json": self.spec}, format="json")
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertIn("id", body)
        self.assertEqual(body["status"], ReelJob.STATUS_QUEUED)
        task_mock.delay.assert_called_once_with(body["id"])

    # -------- GET /api/reels/{id}/ --------

    def test_retrieve_other_users_job_403(self):
        job = ReelJob.objects.create(created_by=self.other_staff, spec_json=self.spec)
        self.client.force_authenticate(self.staff)
        res = self.client.get(f"/api/reels/{job.id}/")
        self.assertEqual(res.status_code, 403)

    def test_retrieve_own_job_200(self):
        job = ReelJob.objects.create(created_by=self.staff, spec_json=self.spec)
        self.client.force_authenticate(self.staff)
        res = self.client.get(f"/api/reels/{job.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["id"], job.id)

    def test_retrieve_unknown_404(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/999999/")
        self.assertEqual(res.status_code, 404)

    # -------- GET /api/reels/ list --------

    def test_list_returns_only_own_jobs(self):
        ReelJob.objects.create(created_by=self.staff, spec_json=self.spec)
        ReelJob.objects.create(created_by=self.staff, spec_json=self.spec)
        ReelJob.objects.create(created_by=self.other_staff, spec_json=self.spec)
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        # DRF default list shape may vary; tolerate both list and {"results": [...]}
        items = body if isinstance(body, list) else body.get("results", [])
        self.assertEqual(len(items), 2)

    # -------- GET /api/reels/{id}/file/ --------

    def test_file_running_job_409(self):
        job = ReelJob.objects.create(
            created_by=self.staff, spec_json=self.spec, status=ReelJob.STATUS_RUNNING
        )
        self.client.force_authenticate(self.staff)
        res = self.client.get(f"/api/reels/{job.id}/file/")
        self.assertEqual(res.status_code, 409)

    def test_file_done_with_url_redirects(self):
        job = ReelJob.objects.create(
            created_by=self.staff,
            spec_json=self.spec,
            status=ReelJob.STATUS_DONE,
            video_url="https://cdn.example/foo.mp4",
        )
        self.client.force_authenticate(self.staff)
        res = self.client.get(f"/api/reels/{job.id}/file/")
        self.assertIn(res.status_code, (302, 303))
        self.assertEqual(res.headers["Location"], "https://cdn.example/foo.mp4")
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_views -v 2
```

Expected: FAIL — endpoints missing.

- [ ] **Step 3: Implement `apps/reels/permissions.py`**

```python
from rest_framework.permissions import BasePermission


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsCreator(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.created_by_id == request.user.id
```

- [ ] **Step 4: Implement `apps/reels/views.py`**

```python
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet
from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin
from django.http import HttpResponseRedirect

from .models import ReelJob
from .permissions import IsCreator, IsStaff
from .serializers import ReelJobCreateSerializer, ReelJobReadSerializer
from .tasks import render_reel


class ReelJobViewSet(
    CreateModelMixin,
    ListModelMixin,
    RetrieveModelMixin,
    GenericViewSet,
):
    queryset = ReelJob.objects.all()
    permission_classes = [IsAuthenticated, IsStaff]

    def get_queryset(self):
        return ReelJob.objects.filter(created_by=self.request.user).order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return ReelJobCreateSerializer
        return ReelJobReadSerializer

    def get_permissions(self):
        if self.action in ("retrieve", "file"):
            return [perm() for perm in (IsAuthenticated, IsStaff, IsCreator)]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = ReelJob.objects.create(
            created_by=request.user,
            spec_json=serializer.validated_data["spec_json"],
        )
        render_reel.delay(job.id)
        return Response(
            ReelJobReadSerializer(job).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request, pk=None):
        job = get_object_or_404(ReelJob, pk=pk)
        self.check_object_permissions(request, job)
        if job.status != ReelJob.STATUS_DONE:
            return Response(
                {"error": f"job is {job.status}, not done"},
                status=status.HTTP_409_CONFLICT,
            )
        if not job.video_url:
            return Response({"error": "no video url"}, status=status.HTTP_404_NOT_FOUND)
        return HttpResponseRedirect(job.video_url)
```

- [ ] **Step 5: Wire URLs in `apps/reels/urls.py`**

```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "reels"

router = DefaultRouter()
router.register(r"", views.ReelJobViewSet, basename="reeljob")

urlpatterns = [
    path("", include(router.urls)),
]
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_views -v 2
```

Expected: 9 tests pass.

- [ ] **Step 7: Run the full reels suite so far**

```bash
python manage.py test apps.reels -v 2
```

Expected: all `apps.reels.*` tests green.

- [ ] **Step 8: Commit**

```bash
git add apps/reels/views.py apps/reels/permissions.py apps/reels/urls.py apps/reels/tests/test_views.py
git commit -m "feat(reels): render endpoints (create, list, retrieve, file)"
```

---

## Task 7: `reap_stale_jobs` + Celery beat schedule

**Repo:** CraftLee/server

Recover from worker crashes: any `ReelJob` stuck at `running` for more than 1 hour gets flipped to `failed` with a sentinel error message. Scheduled every 5 minutes via Celery beat.

**Files:**
- Modify: `apps/reels/tasks.py`
- Modify: `apps/reels/tests/test_tasks.py` (add reaper tests)
- Modify: `craftlee/celery.py` (or `craftlee/settings.py` — wherever `beat_schedule` lives)

- [ ] **Step 1: Locate the existing Celery config**

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
grep -rn "beat_schedule\|app.conf" craftlee/ apps/ --include="*.py" | head -10
```

Note where to add the `reap_stale_jobs` schedule (most likely `craftlee/celery.py`).

- [ ] **Step 2: Append to the test file**

Append to `apps/reels/tests/test_tasks.py`:

```python
from datetime import timedelta


class ReapStaleJobsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.spec = {
            "template": "shayari-reel",
            "app": "craftlee",
            "aspect": "9:16",
            "output": {"name": "x", "formats": ["mp4"]},
            "vars": {"shayariLines": ["a", "b"]},
        }

    def test_reaps_running_jobs_older_than_one_hour(self):
        old_running = ReelJob.objects.create(
            created_by=self.user,
            spec_json=self.spec,
            status=ReelJob.STATUS_RUNNING,
            started_at=timezone.now() - timedelta(hours=2),
        )
        recent_running = ReelJob.objects.create(
            created_by=self.user,
            spec_json=self.spec,
            status=ReelJob.STATUS_RUNNING,
            started_at=timezone.now() - timedelta(minutes=10),
        )
        done = ReelJob.objects.create(
            created_by=self.user,
            spec_json=self.spec,
            status=ReelJob.STATUS_DONE,
            started_at=timezone.now() - timedelta(hours=2),
        )

        n = tasks.reap_stale_jobs()

        old_running.refresh_from_db()
        recent_running.refresh_from_db()
        done.refresh_from_db()

        self.assertEqual(n, 1)
        self.assertEqual(old_running.status, ReelJob.STATUS_FAILED)
        self.assertIn("worker disappeared", old_running.error)
        self.assertEqual(recent_running.status, ReelJob.STATUS_RUNNING)
        self.assertEqual(done.status, ReelJob.STATUS_DONE)

    def test_reaps_returns_zero_when_nothing_stale(self):
        ReelJob.objects.create(
            created_by=self.user,
            spec_json=self.spec,
            status=ReelJob.STATUS_RUNNING,
            started_at=timezone.now() - timedelta(minutes=5),
        )
        self.assertEqual(tasks.reap_stale_jobs(), 0)
```

Make sure the import line at the top of `test_tasks.py` includes `from django.utils import timezone` — already added in Task 4 (no-op if duplicate).

- [ ] **Step 3: Run the test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_tasks.ReapStaleJobsTests -v 2
```

Expected: FAIL — `reap_stale_jobs` doesn't exist.

- [ ] **Step 4: Implement `reap_stale_jobs` in `apps/reels/tasks.py`**

Append:

```python
from datetime import timedelta


@shared_task
def reap_stale_jobs() -> int:
    """Mark any ReelJob stuck at 'running' for >1h as 'failed'.
    Scheduled via Celery beat (see craftlee/celery.py). Returns the
    number of rows reaped."""
    cutoff = timezone.now() - timedelta(hours=1)
    qs = ReelJob.objects.filter(
        status=ReelJob.STATUS_RUNNING,
        started_at__lt=cutoff,
    )
    return qs.update(
        status=ReelJob.STATUS_FAILED,
        error="worker disappeared",
        finished_at=timezone.now(),
    )
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_tasks.ReapStaleJobsTests -v 2
```

Expected: 2 new tests pass; 4 prior `RenderReelTaskTests` still green.

- [ ] **Step 6: Add the beat schedule entry**

Edit `craftlee/celery.py` (locate the `Celery(...)` instance — likely named `app`). Add:

```python
from celery.schedules import crontab

# After app = Celery(...) and any existing config:
app.conf.beat_schedule = {
    **getattr(app.conf, "beat_schedule", {}),
    "reels-reap-stale-jobs": {
        "task": "apps.reels.tasks.reap_stale_jobs",
        "schedule": crontab(minute="*/5"),
    },
}
```

If `craftlee/celery.py` already declares `beat_schedule`, merge the entry into the existing dict instead of using the spread above.

- [ ] **Step 7: Run the full reels suite**

```bash
python manage.py test apps.reels -v 2
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/reels/tasks.py apps/reels/tests/test_tasks.py craftlee/celery.py
git commit -m "feat(reels): reap stale running jobs via celery beat"
```

---

## Task 8: GET `/api/reels/templates/` — list templates

**Repo:** CraftLee/server

Synchronous read of `HFRAMES_ROOT/apps/marketing-engine/templates/*/template.json`. No engine subprocess, no Celery — this is a static-file enumeration that the live preview iframe needs on mount.

**Files:**
- Modify: `apps/reels/views.py`
- Modify: `apps/reels/urls.py`
- Modify: `apps/reels/tests/test_views.py`

- [ ] **Step 1: Append to test file**

Add to `apps/reels/tests/test_views.py`:

```python
class TemplateListEndpointTests(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.client = APIClient()

    def test_list_templates_unauthenticated_401(self):
        res = self.client.get("/api/reels/templates/")
        self.assertEqual(res.status_code, 401)

    def test_list_templates_returns_shayari_reel(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/templates/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIsInstance(body, list)
        names = [t["schema"]["name"] for t in body]
        self.assertIn("shayari-reel", names)
        sr = next(t for t in body if t["schema"]["name"] == "shayari-reel")
        self.assertIn("9:16", sr["schema"]["supportedAspects"])
        self.assertIn("shayariLines", sr["schema"]["slots"])
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_views.TemplateListEndpointTests -v 2
```

Expected: FAIL — endpoint not wired.

- [ ] **Step 3: Add an APIView to `apps/reels/views.py`**

```python
import json
from pathlib import Path

from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView


class TemplateListView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        templates_dir = Path(settings.HFRAMES_ROOT) / "apps/marketing-engine/templates"
        out = []
        if templates_dir.is_dir():
            for child in sorted(templates_dir.iterdir()):
                schema_path = child / "template.json"
                html_path = child / "template.html"
                if not schema_path.is_file() or not html_path.is_file():
                    continue
                try:
                    schema = json.loads(schema_path.read_text())
                except json.JSONDecodeError:
                    continue
                out.append({"schema": schema})
        return Response(out)
```

- [ ] **Step 4: Wire URL**

Edit `apps/reels/urls.py`:

```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "reels"

router = DefaultRouter()
router.register(r"", views.ReelJobViewSet, basename="reeljob")

urlpatterns = [
    path("templates/", views.TemplateListView.as_view(), name="templates"),
    path("", include(router.urls)),
]
```

> **Note on URL ordering:** `DefaultRouter` registers `r""` greedily and would catch `templates/` as an `id`. Define explicit static paths *before* the router include, as shown above.

- [ ] **Step 5: Run the test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_views.TemplateListEndpointTests -v 2
```

Expected: 2 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/reels/views.py apps/reels/urls.py apps/reels/tests/test_views.py
git commit -m "feat(reels): list templates endpoint"
```

---

## Task 9: GET `/api/reels/templates/{name}/html/`

**Repo:** CraftLee/server

Serves raw `template.html` so the iframe can load it for live preview.

**Files:**
- Modify: `apps/reels/views.py`
- Modify: `apps/reels/urls.py`
- Modify: `apps/reels/tests/test_views.py`

- [ ] **Step 1: Append test cases**

Add to `apps/reels/tests/test_views.py`:

```python
class TemplateHtmlEndpointTests(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.client = APIClient()

    def test_unauthenticated_401(self):
        res = self.client.get("/api/reels/templates/shayari-reel/html/")
        self.assertEqual(res.status_code, 401)

    def test_returns_template_html(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/templates/shayari-reel/html/")
        self.assertEqual(res.status_code, 200)
        body = res.content.decode()
        self.assertIn('id="stage"', body)
        self.assertIn('data-slot="shayariLines"', body)
        self.assertEqual(res.headers["Content-Type"].split(";")[0], "text/html")

    def test_unknown_template_404(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/templates/no-such-template/html/")
        self.assertEqual(res.status_code, 404)

    def test_path_traversal_rejected(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/templates/..%2Fevil/html/")
        # Either 404 (not found) or 400 (rejected) acceptable; never 200
        self.assertNotEqual(res.status_code, 200)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_views.TemplateHtmlEndpointTests -v 2
```

Expected: FAIL.

- [ ] **Step 3: Add view**

Append to `apps/reels/views.py`:

```python
import re

from django.http import HttpResponse, HttpResponseNotFound

_SAFE_NAME = re.compile(r"^[a-zA-Z0-9_-]+$")


class TemplateHtmlView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request, name: str):
        if not _SAFE_NAME.match(name):
            return HttpResponseNotFound("template not found")
        path = (
            Path(settings.HFRAMES_ROOT)
            / "apps/marketing-engine/templates"
            / name
            / "template.html"
        )
        if not path.is_file():
            return HttpResponseNotFound("template not found")
        return HttpResponse(path.read_text(), content_type="text/html; charset=utf-8")
```

- [ ] **Step 4: Wire URL**

Update `apps/reels/urls.py`:

```python
urlpatterns = [
    path("templates/", views.TemplateListView.as_view(), name="templates"),
    path("templates/<str:name>/html/", views.TemplateHtmlView.as_view(), name="template-html"),
    path("", include(router.urls)),
]
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python manage.py test apps.reels.tests.test_views.TemplateHtmlEndpointTests -v 2
```

Expected: 4 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/reels/views.py apps/reels/urls.py apps/reels/tests/test_views.py
git commit -m "feat(reels): template html endpoint"
```

---

## Task 10: GET `/api/reels/brands/{name}/`

**Repo:** CraftLee/server

Serves brand JSON for ColorInput swatches and the iframe asset resolver.

**Files:**
- Modify: `apps/reels/views.py`
- Modify: `apps/reels/urls.py`
- Modify: `apps/reels/tests/test_views.py`

- [ ] **Step 1: Append test**

```python
class BrandEndpointTests(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.client = APIClient()

    def test_returns_craftlee_brand(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/brands/craftlee/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["name"], "CraftLee")
        self.assertIn("saffron", body["colors"])

    def test_unknown_brand_404(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/brands/nonexistent/")
        self.assertEqual(res.status_code, 404)

    def test_path_traversal_rejected(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/brands/..%2Fevil/")
        self.assertNotEqual(res.status_code, 200)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_views.BrandEndpointTests -v 2
```

- [ ] **Step 3: Add view**

```python
class BrandView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request, name: str):
        if not _SAFE_NAME.match(name):
            return HttpResponseNotFound("brand not found")
        path = (
            Path(settings.HFRAMES_ROOT)
            / "apps/marketing-engine/assets/brand"
            / f"{name}.json"
        )
        if not path.is_file():
            return HttpResponseNotFound("brand not found")
        try:
            return Response(json.loads(path.read_text()))
        except json.JSONDecodeError:
            return Response({"error": "brand JSON malformed"}, status=500)
```

- [ ] **Step 4: Wire URL**

```python
urlpatterns = [
    path("templates/", views.TemplateListView.as_view(), name="templates"),
    path("templates/<str:name>/html/", views.TemplateHtmlView.as_view(), name="template-html"),
    path("brands/<str:name>/", views.BrandView.as_view(), name="brand"),
    path("", include(router.urls)),
]
```

- [ ] **Step 5: Run test, commit**

```bash
python manage.py test apps.reels.tests.test_views.BrandEndpointTests -v 2
```

Expected: 3 tests pass.

```bash
git add apps/reels/views.py apps/reels/urls.py apps/reels/tests/test_views.py
git commit -m "feat(reels): brand endpoint"
```

---

## Task 11: GET `/api/reels/assets/` + `/api/reels/assets/file`

**Repo:** CraftLee/server

Asset listing for AssetInput thumbnails + asset file serving for iframe `<img>` resolution.

**Files:**
- Modify: `apps/reels/views.py`
- Modify: `apps/reels/urls.py`
- Modify: `apps/reels/tests/test_views.py`

- [ ] **Step 1: Append tests**

```python
class AssetsEndpointTests(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.client = APIClient()

    def test_list_assets_returns_sample_bg(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/assets/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        names = [a["name"] for a in body]
        self.assertIn("sample-bg.png", names)
        # brand/ dir excluded
        self.assertFalse(any(n.startswith("brand/") for n in names))

    def test_asset_file_returns_bytes(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/assets/file?name=sample-bg.png")
        self.assertEqual(res.status_code, 200)
        self.assertGreater(len(res.content), 0)
        self.assertEqual(res.headers["Content-Type"], "image/png")

    def test_asset_file_path_traversal_400(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/assets/file?name=../../etc/passwd")
        self.assertEqual(res.status_code, 400)

    def test_asset_file_missing_404(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/reels/assets/file?name=does-not-exist.png")
        self.assertEqual(res.status_code, 404)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python manage.py test apps.reels.tests.test_views.AssetsEndpointTests -v 2
```

- [ ] **Step 3: Add views**

```python
import mimetypes

from django.http import FileResponse, HttpResponseBadRequest


_KIND_BY_EXT = {
    ".png": "image", ".jpg": "image", ".jpeg": "image",
    ".webp": "image", ".gif": "image", ".svg": "image",
    ".mp3": "audio", ".wav": "audio", ".ogg": "audio", ".m4a": "audio",
    ".mp4": "video", ".mov": "video", ".webm": "video",
}


class AssetListView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        assets_dir = Path(settings.HFRAMES_ROOT) / "apps/marketing-engine/assets"
        out = []
        if assets_dir.is_dir():
            for path in sorted(assets_dir.rglob("*")):
                if not path.is_file():
                    continue
                rel = path.relative_to(assets_dir).as_posix()
                # Skip brand JSON kits
                if rel.startswith("brand/"):
                    continue
                kind = _KIND_BY_EXT.get(path.suffix.lower())
                if not kind:
                    continue
                out.append({"name": rel, "relPath": rel, "kind": kind})
        return Response(out)


class AssetFileView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        name = request.GET.get("name", "")
        if not name or ".." in name or name.startswith("/"):
            return HttpResponseBadRequest("invalid name")
        assets_dir = Path(settings.HFRAMES_ROOT) / "apps/marketing-engine/assets"
        full = (assets_dir / name).resolve()
        if not str(full).startswith(str(assets_dir.resolve())):
            return HttpResponseBadRequest("invalid name")
        if not full.is_file():
            return HttpResponseNotFound("not found")
        content_type, _ = mimetypes.guess_type(str(full))
        return FileResponse(open(full, "rb"), content_type=content_type or "application/octet-stream")
```

- [ ] **Step 4: Wire URL**

```python
urlpatterns = [
    path("templates/", views.TemplateListView.as_view(), name="templates"),
    path("templates/<str:name>/html/", views.TemplateHtmlView.as_view(), name="template-html"),
    path("brands/<str:name>/", views.BrandView.as_view(), name="brand"),
    path("assets/", views.AssetListView.as_view(), name="assets"),
    path("assets/file", views.AssetFileView.as_view(), name="asset-file"),
    path("", include(router.urls)),
]
```

- [ ] **Step 5: Run + commit**

```bash
python manage.py test apps.reels.tests.test_views.AssetsEndpointTests -v 2
```

Expected: 4 tests pass.

```bash
git add apps/reels/views.py apps/reels/urls.py apps/reels/tests/test_views.py
git commit -m "feat(reels): asset list + file endpoints"
```

- [ ] **Step 6: Run the full reels suite to make sure nothing regressed**

```bash
python manage.py test apps.reels -v 2
```

Expected: all green.

---

## Task 12: React `api.ts` — repoint URLs + JWT bearer

**Repo:** HFrames

Update the dashboard's API base, replace EventSource with polling, add JWT bearer header sourced from `localStorage`.

**Files:**
- Modify: `apps/marketing-engine-dashboard/src/client/api.ts`

- [ ] **Step 1: Read the current file for context**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
cat apps/marketing-engine-dashboard/src/client/api.ts
```

- [ ] **Step 2: Rewrite `api.ts`**

```ts
import type {
  TemplateListItem,
  RenderRequest,
  RenderJobAccepted,
  BrandJSON,
  AssetEntry,
  RenderEvent,
} from "../shared/types.ts";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
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

export function subscribeToRender(
  jobId: string,
  onEvent: (ev: RenderEvent) => void,
): () => void {
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
          data: { phase: job.phase, progress: job.progress },
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
  tick();
  return () => {
    stopped = true;
  };
}
```

- [ ] **Step 3: Type-check the dashboard**

```bash
bun run --cwd apps/marketing-engine-dashboard typecheck
```

Expected: clean.

- [ ] **Step 4: Run the dashboard's existing tests**

```bash
bun run --cwd apps/marketing-engine-dashboard test
```

Expected: all green. (Server-side tests are still under `tests/server/` and pass via the bun-server module — they get deleted in Task 15.)

- [ ] **Step 5: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/api.ts
git commit -m "feat(dashboard): repoint api.ts at django, polling subscribe, jwt bearer"
```

---

## Task 13: React `main.tsx` — minimal token-paste login

**Repo:** HFrames

Quickest path: a tiny inline UI that prompts for a JWT once if none in `localStorage`. No real login flow yet — Vaibhav pastes the token from CraftLee admin or `manage.py shell`. Future task can integrate the actual CraftLee login flow.

**Files:**
- Modify: `apps/marketing-engine-dashboard/src/client/main.tsx`

- [ ] **Step 1: Edit `main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ensureToken();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function ensureToken(): void {
  if (localStorage.getItem("jwt")) return;
  const token = window.prompt(
    "Paste a CraftLee JWT (admin user) to use the marketing dashboard:",
  );
  if (token && token.trim()) {
    localStorage.setItem("jwt", token.trim());
  }
}
```

This is a stop-gap deliberate-stop-gap. A proper login flow is its own future task (and is out of scope for this plan, per spec §1.3).

- [ ] **Step 2: Type-check + tests**

```bash
bun run --cwd apps/marketing-engine-dashboard typecheck
bun run --cwd apps/marketing-engine-dashboard test
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing-engine-dashboard/src/client/main.tsx
git commit -m "feat(dashboard): token-paste auth gate"
```

---

## Task 14: Vite dev proxy → CraftLee Django

**Repo:** HFrames

In dev mode, the React app served on `:5173` proxies `/api/*` to CraftLee Django on `:8000`. CORS already enabled on CraftLee server (corsheaders middleware in INSTALLED_APPS).

**Files:**
- Modify: `apps/marketing-engine-dashboard/vite.config.ts`

- [ ] **Step 1: Update vite config**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 2: Smoke check (manual, document only — no automated test)**

In one terminal:

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
python manage.py runserver 127.0.0.1:8000
```

In another:

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
bun run --cwd apps/marketing-engine-dashboard dev:client
```

Open `http://127.0.0.1:5173`. JWT prompt appears (paste a token from `python manage.py shell -c "from rest_framework_simplejwt.tokens import RefreshToken; from django.contrib.auth import get_user_model; u = get_user_model().objects.get(username='admin'); print(RefreshToken.for_user(u).access_token)"` or similar). Templates list loads. Live preview iframe renders.

- [ ] **Step 3: Commit**

```bash
git add apps/marketing-engine-dashboard/vite.config.ts
git commit -m "feat(dashboard): vite proxy to craftlee django"
```

---

## Task 15: Delete bun server

**Repo:** HFrames

The bun server is fully superseded. Remove its source and tests. The dashboard becomes client-only.

**Files:**
- Delete: `apps/marketing-engine-dashboard/src/server/`
- Delete: `apps/marketing-engine-dashboard/tests/server/`
- Modify: `apps/marketing-engine-dashboard/package.json` (drop server-only deps + scripts)
- Modify: `apps/marketing-engine-dashboard/tsconfig.json` (drop server project ref)
- Delete: `apps/marketing-engine-dashboard/tsconfig.server.json`

- [ ] **Step 1: Delete server-side source and tests**

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
rm -rf apps/marketing-engine-dashboard/src/server
rm -rf apps/marketing-engine-dashboard/tests/server
```

- [ ] **Step 2: Drop server scripts from `package.json`**

Edit `apps/marketing-engine-dashboard/package.json` so `scripts` is:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:client": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b"
  }
}
```

Drop these from `dependencies` (only used by the deleted server):

- `@types/bun` (devDependencies)
- `concurrently` (devDependencies)
- `tsx` (devDependencies) — confirm via `grep -r "tsx" apps/marketing-engine-dashboard/`; only used by server scripts.

`react`, `react-dom`, `zod`, `@marketing-engine/app` stay.

- [ ] **Step 3: Drop server tsconfig**

```bash
rm apps/marketing-engine-dashboard/tsconfig.server.json
```

Edit `apps/marketing-engine-dashboard/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.client.json" }]
}
```

- [ ] **Step 4: Refresh deps + verify typecheck/tests**

```bash
bun install
bun run --cwd apps/marketing-engine-dashboard typecheck
bun run --cwd apps/marketing-engine-dashboard test
```

Expected: clean (only client tests remain).

- [ ] **Step 5: Commit**

```bash
git add apps/marketing-engine-dashboard/ bun.lock
git commit -m "chore(dashboard): remove bun server, dashboard is client-only"
```

---

## Task 16: Smoke E2E + final sweep + tag

**Repo:** CraftLee/server (smoke test) + HFrames (CLAUDE.md update + tag)

End-to-end test that produces a real MP4 through the new Django stack. Update HFrames docs to reflect Django architecture. Tag release.

**Files:**
- Create: `apps/reels/tests/test_smoke.py` (CraftLee)
- Modify: `apps/marketing-engine/CLAUDE.md` (HFrames)

- [ ] **Step 1: Create the gated smoke test**

In CraftLee `apps/reels/tests/test_smoke.py`:

```python
import os
from time import sleep

from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.reels.models import ReelJob
from apps.reels.tasks import render_reel


SHOULD_RUN = os.environ.get("SMOKE_RENDER") == "1"


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ReelRenderSmokeTests(TransactionTestCase):
    """Real subprocess render. Gated behind SMOKE_RENDER=1."""

    def setUp(self):
        if not SHOULD_RUN:
            self.skipTest("SMOKE_RENDER!=1; skipping real-render smoke")
        self.staff = get_user_model().objects.create_user(
            username="smoke-staff", password="x", is_staff=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.staff)

    def test_renders_real_mp4(self):
        spec = {
            "template": "shayari-reel",
            "app": "craftlee",
            "aspect": "9:16",
            "duration": 3,
            "output": {"name": "django-smoke", "formats": ["mp4"]},
            "vars": {"shayariLines": ["smoke a", "smoke b"]},
        }
        res = self.client.post("/api/reels/", {"spec_json": spec}, format="json")
        self.assertEqual(res.status_code, 201)
        job_id = res.json()["id"]

        # In eager mode the task ran inline above; verify final state
        job = ReelJob.objects.get(pk=job_id)
        self.assertEqual(job.status, ReelJob.STATUS_DONE, job.error)
        self.assertTrue(job.video_url)
        self.assertGreater(job.duration_ms or 0, 0)
```

- [ ] **Step 2: Run the smoke test (gated; takes 60-180 s on a warm machine)**

```bash
SMOKE_RENDER=1 python manage.py test apps.reels.tests.test_smoke -v 2
```

Expected: 1 test pass, MP4 produced. If it fails, debug — common causes: `BUN_PATH` mismatch, Chrome not installed on the worker, `HFRAMES_ROOT` wrong.

- [ ] **Step 3: Verify default-skipped in CI behavior**

```bash
python manage.py test apps.reels.tests.test_smoke -v 2
```

Expected: 1 test skipped.

- [ ] **Step 4: Update HFrames `apps/marketing-engine/CLAUDE.md`**

Append (or update existing dashboard section):

```markdown
## Dashboard (post-2026-05-01 pivot)

The dashboard's server layer now lives in CraftLee's Django project at
`CraftLee/server/apps/reels/`. Renders are dispatched via Celery and
spawn a fresh `bun src/cli.ts make ... --json-progress` subprocess
per job, structurally avoiding the Bun parent-process pollution that
the v0.2.0 bun server hit. The React frontend at
`apps/marketing-engine-dashboard/src/client/` is unchanged in
architecture; only API URLs and the progress-stream helper differ.

See `apps/marketing-engine/docs/specs/2026-05-01-django-server-design.md`
and `apps/marketing-engine/docs/plans/2026-05-01-django-server.md`.
```

- [ ] **Step 5: Commit and tag**

In HFrames:

```bash
cd /home/vaibhav/AI/Jan-April.../HFrames
git add apps/reels/tests/test_smoke.py apps/marketing-engine/CLAUDE.md
# (test_smoke.py is in CraftLee — commit there separately)
git commit -m "docs(marketing-engine): note django-pivot architecture"
git tag marketing-engine/v0.3.0-django-pivot
```

In CraftLee:

```bash
cd /home/vaibhav/AI/Jan-April.../CraftLee/server
git add apps/reels/tests/test_smoke.py
git commit -m "test(reels): smoke render e2e"
```

(Don't push yet — let the user decide.)

- [ ] **Step 6: Final full-suite checks**

In CraftLee:

```bash
python manage.py test apps.reels -v 2
```

In HFrames:

```bash
bun run --cwd apps/marketing-engine test
bun run --cwd apps/marketing-engine-dashboard test
bun run --cwd apps/marketing-engine-dashboard typecheck
```

Expected: all green.

---

## Self-review checklist

Run through this before declaring the plan complete.

- **Spec coverage:**
  - §1.2 (motivation) → fully implemented in T1–T16; subprocess isolation per render addressed by T3+T4.
  - §2.1 (topology) → T2, T4, T6, T15 produce it.
  - §2.2 (engine integration: `--json-progress`) → T1.
  - §2.3 (frontend integration) → T12, T13, T14, T15.
  - §3.1 (Django app shape) → T2 scaffolds, T3-T7 fills it.
  - §3.2 (`ReelJob` model) → T2.
  - §3.3 (URL surface) → T6 (jobs), T8 (templates list), T9 (template html), T10 (brand), T11 (assets).
  - §3.4 (engine.py wrapper) → T3.
  - §3.5 (tasks) → T4 (render_reel), T7 (reaper).
  - §3.6 (settings) → T2 step 6.
  - §4.1 (CLI contract) → T1.
  - §4.2 (render flow) → T1+T3+T4+T6 cover end-to-end.
  - §4.3 (live preview flow) → T8-T11.
  - §4.4 (`subscribeToRender` rewrite) → T12.
  - §5.x (error handling) → T3 (RenderError/RenderTimeout), T4 (status=failed transitions), T6 (4xx HTTP), T7 (reaper).
  - §6 (testing) → T1, T3, T4, T5, T6, T8-T11, T16 each include unit tests; T16 has smoke.
  - §7 (phases) → T1 = Phase 1; T2-T7 = Phase 2; T8-T11 = Phase 3; T12-T14 = Phase 4; T15-T16 = Phase 5.
  - §9 (acceptance criteria) → T16 step 6 verifies.

- **Placeholder scan:** no "TBD" / "TODO" / "implement later" / "similar to Task N". Each step has actual code or commands.

- **Type consistency:**
  - `ReelJob.STATUS_*` constants — defined in T2, consumed in T4, T6, T7.
  - `engine.RenderError`, `engine.RenderTimeout` — defined in T3, caught in T4 + T7 (no, only T4; reaper handles a different case).
  - `render_reel.delay(job_id)` — task defined in T4, called from view in T6.
  - `_upload_mp4` — defined in T4, mocked in T4 tests.
  - URL paths — `/api/reels/` (T6 router), `/api/reels/templates/` (T8), `/api/reels/templates/<name>/html/` (T9), `/api/reels/brands/<name>/` (T10), `/api/reels/assets/` (T11), `/api/reels/assets/file` (T11). Static paths declared before router include in T8/T9/T10/T11 — explicit comment in T8 step 4.

- **Scope:** Single-app implementation, ~16 tasks, ~4-5 days. Each task ends in a green test + commit. No subsystem hidden behind a vague "improve X".

- **Ambiguity:**
  - T2 step 6: `BUN_PATH` default may differ on user's machine; explicit verify note in step 6.
  - T4 step 1: existing `storage.upload_video` may or may not exist; explicit verify-or-fall-back note.
  - T7 step 1: existing `beat_schedule` may or may not exist; explicit merge instruction.
  - T15 step 2: dropped `tsx` only if grep confirms it's unused; explicit grep instruction.
  - All other steps are deterministic.

---

## Done

Plan ends here. Implementer should run prerequisites P1-P4, then walk T1 → T16 in order, stopping for clarification only on real blockers (not for confirming a step worked — the test does that).
