# HDR regression — testing gaps & follow-up

This directory contains visual reproductions for HDR rendering bugs. Several of
them are not yet covered by automated assertions. This file enumerates the gaps
and the recommended remediations, in priority order.

## Current state

| Surface | What runs | What it catches | Where |
| --- | --- | --- | --- |
| `hdr-smoke.ts` | All five fixtures (`sdr-baseline`, `hdr-pq`, `mixed-sdr-hdr`, `hdr-feature-stack`, `opacity-mixed-fade`) | Color metadata only — `pix_fmt`, `color_transfer`, `color_primaries`, MaxCLL / MasteringDisplay side data | `packages/producer/scripts/hdr-smoke.ts` |
| Main regression harness (`bun run test`) | Top-level entries under `packages/producer/tests/*` with a `meta.json` | PSNR, frame failures, audio correlation | `packages/producer/src/regression-harness.ts` |
| CI `regression` workflow | Hardcoded shards (`style-1-prod`, `gsap-letters-render-compat`, …) | Same as harness, on Docker | `.github/workflows/regression.yml` |
| Engine unit tests | `videoFrameExtractor`, `streamingEncoder`, `hdrCapture`, `chunkEncoder`, `frameCapture`, `parallelCoordinator`, `mp4HdrBoxes`, `hdr` | Encode boundaries, mp4 box muxing | `packages/engine/src/services/*.test.ts` |

## What's NOT covered

1. **The SDR opacity yoyo bug** fixed in `screenshotService.ts` (`removeDomLayerMask`
   stripping inline `opacity`; `injectVideoFramesBatch` clobbering opacity from
   the `<video>` source) has **no automated test**. The fix exists only as code
   comments and the manual fixture `opacity-mixed-fade`.
2. **The `hdr-regression` fixtures are invisible to the main regression harness.**
   `discoverTestSuites()` does a one-level `readdirSync(packages/producer/tests/)`
   and looks for `<entry>/meta.json`. The HDR fixtures live one level deeper at
   `tests/hdr-regression/<fixture>/meta.json`, so they are silently skipped.
3. **`hdr-smoke.ts` is not wired to CI.** Nothing in `.github/workflows/`
   references it, and `packages/producer/package.json` has no `hdr:smoke`
   script. It only runs when someone types it locally.
4. **Even when `hdr-smoke.ts` runs, it cannot catch the opacity bug** — it only
   asserts on container metadata, not on pixel values.

## Recommended follow-up, in priority order

### P0 — Unit test for `screenshotService` opacity preservation

Highest value-per-line. Catches both `removeDomLayerMask` and
`injectVideoFramesBatch` regressions in milliseconds with no Chrome/ffmpeg
dependency.

**Where:** `packages/engine/src/services/screenshotService.test.ts`

**Cases:**

- `applyDomLayerMask` → `removeDomLayerMask` round trip on an element with
  inline `opacity: 0.5` preserves the inline opacity. Today's bug would
  trip on `el.style.opacity === ""` after `removeDomLayerMask`.
- `injectVideoFramesBatch` against a `<video>` whose wrapper has GSAP-applied
  `opacity: 0.42` produces an `<img>` with **no** inline `opacity` and the
  `<video>` element forced to `opacity: 0 !important`. The wrapper's inline
  opacity must remain unchanged.
- Same as above but with GSAP's animated opacity at `0` — verify the injected
  `<img>` still inherits the wrapper's `0` (i.e. is invisible) without us
  copying anything onto the `<img>` itself.

**Estimated effort:** ~50 LOC, sub-second runtime, runs in the existing `test`
job in `.github/workflows/ci.yml`.

### P1 — Wire `hdr-smoke.ts` into CI

Catches encode-path regressions (HDR10 metadata loss, side-data drops, pix_fmt
drift) automatically on every PR that touches engine/producer code.

**Steps:**

1. Add `"test:hdr-smoke": "tsx scripts/hdr-smoke.ts"` to
   `packages/producer/package.json`.
2. Add a job in `.github/workflows/regression.yml` (gated on the same `changes`
   filter as the existing shards) that runs the smoke script inside the
   regression Docker image. It needs `ffmpeg` + `ffprobe` (already present in
   `Dockerfile.test`) and a video device shim — same setup as the existing
   shards.
3. Decide on fixture coverage in CI vs locally. Suggested split:
   - CI: `sdr-baseline`, `hdr-pq` (fast, deterministic, asset-free).
   - Local-only: `mixed-sdr-hdr`, `hdr-feature-stack`, `opacity-mixed-fade`
     (heavier, bigger asset footprint). Gate via an env var or a CLI flag.

**Estimated effort:** ~30 LOC of workflow YAML + npm script. No code changes.

### P2 — Pixel-band assertion in `hdr-smoke.ts` for `opacity-mixed-fade`

Tightens the loop so a future opacity regression on SDR-inside-HDR fails CI,
not just a manual visual review.

**Approach:**

1. Extract a known frame (e.g. `t = 3.0s`, mid-yoyo) from the rendered
   `opacity-mixed-fade` output via `ffmpeg -ss 3 -frames:v 1 -f rawvideo`.
2. Sample a small region of pixels covering the SDR clip's frame.
3. Assert mean luminance falls within a tolerance band corresponding to the
   expected `opacity ≈ 0.15`. Choose the band wide enough to absorb codec
   noise (~±10% YUV-Y) but narrow enough that `opacity = 1` (the regression
   shape) clearly fails.
4. Repeat for the entry-fade midpoint (`t ≈ 1.35s`, expected `opacity ≈ 0.5`).

**Risks:**

- Pixel assertions can be flaky across platforms (macOS vs Linux Docker x265
  builds differ slightly). Mitigate by sampling means over a region rather
  than per-pixel comparison, and by using generous tolerance bands.
- Requires `opacity-mixed-fade` to be in the CI fixture set (see P1 split).

**Estimated effort:** ~80 LOC in `hdr-smoke.ts`, plus tuning the tolerance
bands once on each platform.

### P3 — Fold the `hdr-regression` fixtures into the main regression harness

Long-term, the cleanest answer is to make `discoverTestSuites()` aware of the
nested directory and let the existing PSNR-vs-golden machinery cover HDR too.

**Why this is P3, not P0:**

- Goldens for HDR fixtures don't exist yet. Generating Linux/Docker goldens for
  HDR content is non-trivial — the harness compares against committed MP4s and
  HDR encodes are sensitive to x265 build + GPU vs CPU pipelines.
- PSNR thresholds for HDR (BT.2020 PQ) need different defaults than SDR
  (BT.709) — the dynamic range is wider, so the same dB difference represents
  a larger or smaller perceptual error depending on luminance.
- The hardcoded shard list in `regression.yml` would need to learn about a new
  shard or accept a glob.

**Approach (sketch):**

1. Teach `discoverTestSuites()` to recurse one level into `hdr-regression/` (or
   accept a glob).
2. Generate golden MP4s on Linux/Docker for the deterministic fixtures
   (`sdr-baseline`, `hdr-pq`).
3. Add `shard: hdr-regression` to the matrix in `regression.yml`.
4. Decide per-fixture PSNR thresholds; HDR likely needs `minPsnr: ~22-24`
   given x265 10-bit encode variance.

**Estimated effort:** Multi-day, including platform calibration.

## Related code references

- The opacity bug fixes:
  - `packages/engine/src/services/screenshotService.ts` lines 267–290 (the
    `removeDomLayerMask` invariant comment)
  - `packages/engine/src/services/screenshotService.ts` lines 410–445
    (`injectVideoFramesBatch` `opacity` handling)
- The metadata-only smoke harness: `packages/producer/scripts/hdr-smoke.ts`
- The fixture itself: `packages/producer/tests/hdr-regression/opacity-mixed-fade/`
- The main regression harness: `packages/producer/src/regression-harness.ts`
  (`discoverTestSuites` at line 161)
- The CI matrix: `.github/workflows/regression.yml`
