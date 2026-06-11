---
title: "evals-package-scaffold: @aya/evals workspace + scorers + runner"
type: log
packages: [evals, llm]
tasks: [evals-package-scaffold]
summary: Scaffolded @aya/evals — versioned JSON datasets, deterministic scorers (CER, boundary F1 + idiom-split, reconstruction), an offline-capable runEvals over the real runOcr/analyzeText, optional LangSmith dataset registration, and `npm run eval`. 21 offline tests pass.
updated: 2026-06-11
---

# evals-package-scaffold

Created `packages/evals` (`@aya/evals`) depending on `@aya/llm` + `@aya/shared`,
mirroring the llm package's build/test conventions.

- **Datasets**: versioned fixtures `datasets/<name>/<version>.json` (ocr/v1, analysis/v1),
  Zod-validated on load (`src/datasets.ts`). OCR set carries the hard PRD cases; analysis
  gold enforces its own reconstruction invariant.
- **Scorers** (`src/scorers.ts`, pure): CER/char-accuracy, boundary F1 (cut-offset based),
  idiom-split count (must stay 0), reconstruction (delegates to shared `checkReconstruction`).
- **Runner** (`src/run-evals.ts`): `runEvals` runs the SAME `runOcr`/`analyzeText` as
  production, with the llm injectable-runner pattern so it scores offline. Model stages
  skip cleanly (and the summary says so) when no `ANTHROPIC_API_KEY`/runner is present.
  CLI entrypoint exits non-zero on any idiom split.
- **LangSmith** (`src/langsmith.ts`): `isLangSmithEnabled` + `registerLangSmithDataset`
  dynamic-imports the `langsmith` client and no-ops when disabled — offline path never
  loads it.
- `npm run eval -w packages/evals` = `tsc && node dist/run-evals.js`; verified it runs and
  exits 0 with no keys (both stages skipped, LangSmith disabled).

## Verification

Real (offline): repo-wide `typecheck` + `lint` + `build` pass; 21 `node --test` cases pass
(scorers, dataset load/validation, langsmith gating, full `runEvals` perfect-run +
skip-without-key + split-idiom-detected). `npm run eval` executes end-to-end locally.

**Mocked/gated**: the model path has never hit the real Anthropic API and no dataset has
reached a real LangSmith project. Recorded against the existing
[langsmith-account](../handoffs/langsmith-account.md) handoff (updated) and covered by
[anthropic-api-key](../handoffs/anthropic-api-key.md).

## Brain pages touched

- Added `brain/packages/evals.md`.
- Updated `brain/packages/llm.md` (eval suite now exists).
- Updated `brain/handoffs/langsmith-account.md` (scaffold built; real dataset run still gated).
