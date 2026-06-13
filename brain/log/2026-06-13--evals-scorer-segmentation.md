---
title: "evals-scorer-segmentation: scoreSegmentation entry point (F1 + idiom-split hard-fail)"
type: log
packages: [evals]
tasks: [evals-scorer-segmentation]
summary: Added scoreSegmentation(predTokens, goldBoundaries) → { precision, recall, f1, idiomSplitCount } as the single analysis-stage entry point over the existing boundaryF1/idiomSplitCount primitives; treats every multi-char gold token as a must-keep-whole idiom so a split is a hard failure. Refactored run-evals scoreAnalysis to use it. 3 new unit tests (perfect, off-by-one, idiom-split); 33 offline tests pass.
updated: 2026-06-13
---

# evals-scorer-segmentation

Implemented the segmentation scorer entry point asked for in the plan. The
boundary-F1 and idiom-split **primitives already existed** (from the scaffold);
this task wrapped them into the `scoreSegmentation(predTokens, goldBoundaries)`
shape the acceptance criteria named, and pointed the runner at it.

## What changed

- `packages/evals/src/scorers.ts`:
  - New `SegmentationScore` interface (`extends BoundaryScore` with `idiomSplitCount`).
  - New `scoreSegmentation(predTokens, goldBoundaries)` → `{ precision, recall, f1,
    idiomSplitCount }`. It derives the must-keep-whole idioms as **every multi-char
    gold token** (`goldBoundaries.filter(t => t.length > 1)`) and delegates to
    `boundaryF1` + `idiomSplitCount`. Perfect match ⇒ F1 1.0, idiomSplitCount 0;
    any split idiom is a hard failure independent of F1.
- `packages/evals/src/run-evals.ts`: `scoreAnalysis` now calls `scoreSegmentation`
  once instead of `boundaryF1(...).f1` + `idiomSplitCount(...)` separately (same
  numbers, less duplication). Import swapped `boundaryF1` → `scoreSegmentation`;
  `idiomSplitCount` kept for the AnalysisFailedError fallback row.
- `packages/evals/src/index.ts`: export `scoreSegmentation` + type `SegmentationScore`.
- `scorers.test.ts`: 3 new tests — perfect (F1 1.0 / splits 0), off-by-one boundary
  (a dropped 很|好 boundary → recall < 1, precision 1, idiom kept whole), idiom-split
  (画蛇添足 → 画/蛇/添/足 → idiomSplitCount 1, F1 < 1).

## Gotcha worth remembering

`scoreSegmentation` treats **all** multi-char gold tokens as idioms-to-keep-whole,
so the idiom-split counter also fires on broken compounds (e.g. 做事). When writing
an "off-by-one boundary" case that must keep `idiomSplitCount === 0`, the prediction
must **merge** single-char gold tokens (or split nothing multi-char), not split a
multi-char one. The hard-fail summary gate (`totalIdiomSplits > 0` in `printReport`)
is unchanged.

## Verification

Real, offline. `npm run typecheck && lint && build` (repo-wide, all 7 packages
green), `npm run test -w packages/evals` (33/33 pass), `npm run eval -w packages/evals`
(runs clean, model stages skipped without ANTHROPIC_API_KEY). No new handoffs — the
existing anthropic-api-key / langsmith-account handoffs still cover running the
analysis stage against the real model.
