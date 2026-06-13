---
title: "evals-reconstruction-and-report: reconstruction auto-fail + six-metric baseline gate"
type: log
packages: [evals]
tasks: [evals-reconstruction-and-report]
summary: Made the reconstruction invariant a hard per-example auto-fail in the analysis stage (passed = reconstructionOk, independent of quality), added the sixth metric (judge score distribution), and built src/report.ts + datasets/baseline.json — extractMetrics/loadBaseline/compareToBaseline gating the run on regression-beyond-tolerance and absolute floors/ceilings; the CLI now exits non-zero on any finding. 69 offline tests pass; eval CLI exits 0 offline.
updated: 2026-06-13
---

# evals-reconstruction-and-report

Closed the last eval task: made the reconstruction invariant a hard per-example gate and
added the run-level baseline comparison that turns `npm run eval` into a real CI gate.

## What I built

- **Reconstruction = automatic example fail.** Added `passed: boolean` to `AnalysisEvalRow`
  (= `reconstructionOk`). When `analyzeText` throws `AnalysisFailedError` (reconstruction
  failed even after its one retry) or the rebuilt phrases don't reconstruct, the example is
  marked failed **regardless** of segmentation/pinyin quality. `printReport` now prints a
  per-example reconstruction ✓/✗ line.
- **Sixth headline metric.** Added `translation.scoreDistribution` (mean of each judge
  dimension) to `EvalReport`, printed under the Translation line — completing the six
  metrics specs/06-evals.md names (CER, boundary F1, idiom splits, pinyin mismatch rate,
  judge score distribution, reconstruction pass rate).
- **`src/report.ts` — the baseline gate.** `extractMetrics` flattens the six metrics
  (skipped stage → `null`); `loadBaseline` reads/validates `datasets/baseline.json`
  (`BaselineSchema`: recorded `metrics` + per-metric `gates`); `compareToBaseline` returns
  `{ ok, findings[], skipped[] }`, gating each metric on a `MetricGate`
  (`direction` higher/lower, regression `tolerance` vs baseline, optional absolute
  `threshold` floor/ceiling). `null` metrics are recorded in `skipped` and never gated.
- **`datasets/baseline.json`** — metric values are placeholders (PRD/spec bars) pending the
  first real Anthropic run; gates are real: idiom-split ceiling 0, reconstruction floor 1.0,
  OCR floor 0.95, plus regression tolerances.
- **CLI rewrite.** The entrypoint now loads the baseline, runs `compareToBaseline`, prints
  the comparison, and exits non-zero on any finding — subsuming the old idiom-split-only exit.
- Exported `findDatasetsDir` from `datasets.ts` so `report.ts` reuses the package-root walk.

## Verification

- `npm run test -w @aya/evals` → **69 pass** (was 56; +12 in `report.test.ts` covering
  extract/skip/regression/threshold/idiom-ceiling/reconstruction-floor/judge-dimension and a
  `loadBaseline` of the real on-disk file, +1 run-evals test proving a non-reconstructing
  runner auto-fails every analysis example).
- `npm run eval -w @aya/evals` → exits **0** offline (all model stages skipped → all metrics
  null → not gated; baseline comparison prints PASS).
- Repo-wide `typecheck`, `lint`, `build` all green.

## Notes / gotchas

- `exactOptionalPropertyTypes` is on, so `MetricGate` is `z.infer<typeof MetricGateSchema>`
  (not a hand-written `interface` with `threshold?: number`) to keep `threshold?: number`
  vs `number | undefined` assignable to the Zod-validated baseline.
- The whole gate is still **offline-honest**: with no Anthropic key the model stages produce
  no rows, every metric is `null`, and the run passes — so CI/local green doesn't imply the
  real model was ever scored. Real gating waits on the anthropic-api-key handoff (the
  baseline's values must be re-captured from the first real run).
