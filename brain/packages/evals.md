---
title: "@aya/evals"
type: package
packages: [evals]
tasks: [evals-package-scaffold, evals-seed-datasets]
summary: Eval workspace — versioned JSON datasets (OCR, analysis/segmentation, translation), deterministic scorers (CER, boundary F1 + idiom-split, reconstruction), an offline-capable runner over the real runOcr/analyzeText, and optional LangSmith dataset registration. `npm run eval` works locally with no keys.
updated: 2026-06-13
---

# @aya/evals (as built)

Scaffolded by `evals-package-scaffold`. Runs the **same** `runOcr` / `analyzeText`
the production API uses (imported from `@aya/llm`), scores them with deterministic
local scorers, and prints a summary. LangSmith is a soft dependency — the suite runs
fully offline when its env is absent.

## Status

- Package, datasets, scorers, runner, and LangSmith wiring all built and unit-tested
  **offline** (21 node:test cases). The model stages have **never run against the real
  Anthropic API** and no dataset has been pushed to a real LangSmith project — both
  gated on existing handoffs (anthropic-api-key, langsmith-account).

## What lives where

- `src/datasets.ts` — Zod schemas + `loadOcrDataset` / `loadAnalysisDataset` /
  `loadTranslationDataset` (each defaulting to `v1`). Fixtures are validated on load; the
  analysis schema enforces `goldBoundaries.join('') === fullText` (reconstruction invariant
  for the gold itself), and the translation schema enforces `fullText.includes(phrase)` (the
  phrase under test must occur verbatim in its passage). `findDatasetsDir()` walks up from the
  module to locate `datasets/` (works from `dist/` and `dist-test/`).
- `datasets/ocr/v1.json`, `datasets/analysis/v1.json`, `datasets/translation/v1.json` —
  versioned fixtures (`<name>/<version>.json`), seeded by `evals-seed-datasets`:
  - **OCR (5)**: small-but-real literary passages (multi-line, punctuation, a 成语 page, a
    proper-noun page) plus the hard PRD cases `unreadable` (empty fullText) and
    `no_chinese_text`. Image refs are placeholder S3 URLs until real photos land.
  - **Analysis (4)**: segmentation gold emphasising idioms kept whole (`画蛇添足`, `弄巧成拙`),
    compounds (`天气`, `公园`, `散步`), and a proper noun (`鲁迅`), each with `goldPinyin`.
  - **Translation (5)**: context-dependent phrases (`意思` as a gift, `东西` as "things",
    `老是` as "always", `算了` as "forget it", the 成语 `不择手段`) with a context-free
    `referenceTranslation`, the `referenceContextualMeaning` to reward, and `rubricNotes` for
    the (deferred) LLM-as-judge scorer.
- `src/scorers.ts` — pure functions: `editDistance`, `characterErrorRate` /
  `characterAccuracy` (CER), `boundaryF1` (compares interior cut offsets of two
  segmentations over the same text), `idiomSplitCount` (gold multi-char tokens not kept
  whole — must stay 0), `reconstructionPass` (delegates to shared `checkReconstruction`).
  The LLM-as-judge translation scorer is intentionally NOT here yet (needs the Anthropic key).
- `src/langsmith.ts` — `isLangSmithEnabled(env)` (needs `LANGCHAIN_TRACING_V2=true` +
  a `LANGCHAIN_API_KEY`/`LANGSMITH_API_KEY`) and `registerLangSmithDataset()` which
  **dynamic-imports** `langsmith` and no-ops (returns `false`) when disabled, so the
  offline path never loads the client.
- `src/run-evals.ts` — `runEvals(options)` → structured `EvalReport`; `printReport`;
  the `isMain()`-guarded CLI entrypoint. Model stages run only when a runner is injected
  OR `ANTHROPIC_API_KEY` is set — otherwise the report section is empty and the summary
  says "skipped". The translation set is **loaded/validated on every run** (and registered
  to LangSmith when enabled) but not scored — its `EvalReport.translation.exampleCount` is
  reported; the LLM-as-judge scorer is deferred (needs the Anthropic key). The CLI exits
  non-zero if `totalIdiomSplits > 0`.
- `src/index.ts` — barrel re-exporting datasets, scorers, langsmith, and runner.

## Conventions

- Mirrors `@aya/llm`: ESM, `tsconfig.json` (+ `tsconfig.test.json` → `dist-test`),
  `node --test`, the shared flat eslint config, build = `tsc`.
- **Same dependency-injection pattern as llm**: `runEvals` accepts injected
  `ocrRunner`/`analysisRunner` (`StructuredRunner<T>`), so tests score fixed model
  output with zero network. Production path resolves real runners via the llm config.
- `npm run eval -w packages/evals` = `tsc && node dist/run-evals.js` (compile then run,
  rather than relying on TS strip-types).
- Datasets are versioned files, not code — add `v2.json` rather than mutating `v1`.

## Gotchas

- `langsmith` is a **devDependency** but resolved via dynamic import — it is already
  present transitively through `langchain`. Keep the import lazy so offline runs don't
  load it.
- `boundaryF1` assumes both segmentations cover the **same** underlying text (true by
  construction — both reconstruct `fullText`); it compares cut-point offsets, not tokens.
- The dependency rule holds: evals depends on `@aya/llm` + `@aya/shared` only.
