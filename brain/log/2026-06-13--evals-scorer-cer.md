---
title: "evals-scorer-cer: scoreCER + ≥95% below-target summary"
type: log
packages: [evals]
tasks: [evals-scorer-cer]
summary: Added scoreCER (→ {cer, accuracy}) and summariseCer (batch summary flagging every example below the 0.95 CER_ACCURACY_TARGET KPI) on top of the scaffold CER primitives; wired the OCR report/printout to surface below-target pages. 8 new unit tests, 30 offline tests pass.
updated: 2026-06-13
---

# evals-scorer-cer

The scaffold (`evals-package-scaffold`) already shipped the CER primitives
(`editDistance`, `characterErrorRate`, `characterAccuracy`). This task completed the
OCR Character Error Rate scorer to its acceptance criteria.

## What was built

- `scoreCER(pred, gold)` in `packages/evals/src/scorers.ts` — the OCR-stage entry
  point returning `{ cer, accuracy }`. `accuracy` is clamped to [0, 1]; `cer` is the
  standard gold-length-normalised rate and **may exceed 1** when the prediction is much
  longer than the gold (documented + tested).
- `CER_ACCURACY_TARGET = 0.95` — the PRD ≥95% char-accuracy KPI, now in one place.
- `summariseCer(examples, target?)` → `CerSummary` (`rows`, `meanAccuracy`, `target`,
  `belowTarget[]`, `allPassed`) — flags every example below the target. Empty batch is
  vacuously `allPassed: true` with `meanAccuracy: 0`.
- Wired into `run-evals.ts`: OCR scoring now uses `scoreCER`, and `EvalReport.ocr` gained
  `accuracyTarget` + `belowTarget[]`; `printReport` prints a ⚠ line listing under-KPI pages.
- Exported all new symbols/types from the barrel.

## Verification

- `npm run typecheck` / `lint` / `build` clean repo-wide (9 tasks).
- 30 offline `node:test` cases pass (8 new): identical, single-edit, both empty-string
  cases, accuracy-clamp-when-CER>1, below-target flagging, all-pass + empty batch, custom
  threshold. Real OCR accuracy against the model stays gated on the anthropic-api-key /
  langsmith-account handoffs (unchanged) — `npm run eval` runs offline and reports OCR skipped.

## Gotcha

CER is normalised by **gold** length only, so a verbose hallucination can push CER above 1;
accuracy (`1 - CER`) is the clamped, KPI-comparable number — gate on accuracy, not raw CER.
