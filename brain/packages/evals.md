---
title: "@aya/evals"
type: package
packages: [evals]
tasks: [evals-package-scaffold, evals-seed-datasets, evals-scorer-cer, evals-scorer-segmentation, evals-scorer-pinyin, evals-scorer-translation-judge]
summary: Eval workspace — versioned JSON datasets (OCR, analysis/segmentation, translation), deterministic scorers (CER scoreCER/summariseCer with ≥95% target flagging, scoreSegmentation = boundary precision/recall/F1 + idiom-split hard-fail, scorePinyin/summarisePinyin = library-reference pinyin check with polyphone exceptions, reconstruction) plus an LLM-as-judge translation scorer (scoreTranslation), an offline-capable runner over the real runOcr/analyzeText (+ judge), and optional LangSmith dataset registration. `npm run eval` works locally with no keys.
updated: 2026-06-13
---

# @aya/evals (as built)

Scaffolded by `evals-package-scaffold`. Runs the **same** `runOcr` / `analyzeText`
the production API uses (imported from `@aya/llm`), scores them with deterministic
local scorers, and prints a summary. LangSmith is a soft dependency — the suite runs
fully offline when its env is absent.

## Status

- Package, datasets, scorers (incl. the LLM-as-judge translation scorer), runner, and
  LangSmith wiring all built and unit-tested **offline** (56 node:test cases). The model
  stages — OCR, analysis, **and the judge** — have **never run against the real
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
  `characterAccuracy` (CER primitives), `scoreCER` (the OCR-stage entry point →
  `{ cer, accuracy }`; accuracy clamped to [0,1], CER may exceed 1 for over-long
  predictions), `summariseCer` (batch → `CerSummary` flagging every example below
  `CER_ACCURACY_TARGET = 0.95`, the PRD KPI), `boundaryF1` (compares interior cut offsets of
  two segmentations over the same text), `idiomSplitCount` (gold multi-char tokens not kept
  whole — must stay 0), `scoreSegmentation(predTokens, goldBoundaries)` (the analysis-stage
  entry point → `{ precision, recall, f1, idiomSplitCount }`; derives the must-keep-whole
  idioms as every multi-char gold token, so a split idiom is a hard failure independent of
  F1), `reconstructionPass` (delegates to shared `checkReconstruction`). `run-evals`'
  `scoreAnalysis` scores via `scoreSegmentation` (one call) rather than `boundaryF1` +
  `idiomSplitCount` separately. The LLM-as-judge translation scorer lives in its own
  file (`translation.ts`), not here — these are deterministic; the judge is a model call.
- `src/translation.ts` — the LLM-as-judge translation scorer (specs/06-evals.md dimension
  4). `scoreTranslation(phrase, context, candidate, referenceNotes, options)` runs a SECOND
  Claude call (`StructuredRunner<JudgeRubric>`) that grades three fixed rubric dimensions —
  `faithfulness`, `contextualCorrectness`, `fluency` — each an **integer 1–5**
  (`JudgeRubricSchema`), plus a free-text `rationale`, then applies a per-dimension pass
  threshold (`DEFAULT_JUDGE_THRESHOLD = 4`; every dimension must be ≥ threshold to `pass`).
  Same DI/lazy-config pattern as `@aya/llm`: an injected `runner` grades fixed output with
  zero network (tests), else `buildJudgeRunner` builds a real `createStructuredRunner` from
  `loadJudgeConfig(env)` — which reads the judge model id from **`AYA_JUDGE_MODEL`** (never
  hard-coded, golden rule #9) at fixed temperature 0. `buildJudgeSystemPrompt` /
  `buildJudgeUserMessage` are diffable string builders (no model id baked in). Output is
  defensively re-parsed with `JudgeRubricSchema` even though the runner validated.
- `src/pinyin.ts` — the pinyin-correctness scorer (specs/06-evals.md dimension 3). Uses
  **pinyin-pro** (runtime dep) as the deterministic reference: `referencePinyin(token)` →
  the library's tone-symbol, space-separated reading; `characterReadings(char)` → all valid
  readings of a single char (`multiple`); `normalizePinyin` (lower-case/collapse-ws/trim, so
  proper-noun capitalisation and spacing never count as a mismatch) and `stripTones` (NFD
  strip of combining diacritics). `scorePinyin(token, predicted)` → `{ token, predicted,
  reference, match, polyphoneException }`: a match is an exact normalised hit, OR a single-char
  alternate reading, OR a `DEFAULT_POLYPHONE_EXCEPTIONS` entry (or a tone-only diff for a listed
  token) — those three set `polyphoneException`. `summarisePinyin(tokens)` → `{ total, matched,
  polyphoneExceptions, mismatches, mismatchRate }`; `mismatchRate` excludes polyphone exceptions
  from the denominator (PRD target: near-0). `run-evals`'s `scoreAnalysis` scores every
  predicted phrase with a non-null pinyin AND a Han character against the library and rolls
  `pinyinScored`/`pinyinMismatches`/`pinyinMismatchRate` into `EvalReport.analysis` (printed
  under the Analysis line).
- `src/langsmith.ts` — `isLangSmithEnabled(env)` (needs `LANGCHAIN_TRACING_V2=true` +
  a `LANGCHAIN_API_KEY`/`LANGSMITH_API_KEY`) and `registerLangSmithDataset()` which
  **dynamic-imports** `langsmith` and no-ops (returns `false`) when disabled, so the
  offline path never loads the client.
- `src/run-evals.ts` — `runEvals(options)` → structured `EvalReport`; `printReport`;
  the `isMain()`-guarded CLI entrypoint. The OCR section scores via `scoreCER` and the report
  carries `ocr.accuracyTarget` (0.95) + `ocr.belowTarget[]` (ids/accuracy of pages under the
  KPI), which `printReport` flags with a ⚠ line. Model stages run only when a runner is injected
  OR `ANTHROPIC_API_KEY` is set — otherwise the report section is empty and the summary
  says "skipped". The translation set is **loaded/validated on every run** (and registered
  to LangSmith when enabled) and **judged when possible**: the judge stage runs when a
  `judgeRunner` is injected OR (`ANTHROPIC_API_KEY` AND `AYA_JUDGE_MODEL`) are both present
  — grading each example's `referenceContextualMeaning` as the candidate. The report's
  `translation` block carries `exampleCount`, `rows[]` (per-dimension scores + `pass`),
  `passRate`, and `threshold`; `printReport` prints the pass rate or a "judge skipped" line.
  The CLI exits non-zero if `totalIdiomSplits > 0`.
- `src/index.ts` — barrel re-exporting datasets, scorers, pinyin, translation (judge),
  langsmith, and runner.

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
- `pinyin-pro` is the one **runtime** third-party dep (besides zod) — the pinyin scorer
  imports it eagerly (it is small and offline, no network/data download), unlike the lazy
  `langsmith` import. It is the deterministic reference; the eval check is NOT an LLM judge.
- pinyin-pro lower-cases readings and applies tone sandhi (`一起` → `yì qǐ`); `normalizePinyin`
  makes the comparison case/space-insensitive but tone-sensitive, so genuine tone errors still
  fail while proper-noun capitalisation (gold `Lǔ Xùn` vs library `lǔ xùn`) does not.
- The polyphone strategy is two-layered: single-char tokens accept any reading the character
  has; multi-char tokens only get forgiveness from the small, explicit
  `DEFAULT_POLYPHONE_EXCEPTIONS` list — extend that list as real eval cases surface, rather
  than loosening the matcher.
- The dependency rule holds: evals depends on `@aya/llm` + `@aya/shared` only (plus zod +
  pinyin-pro as leaf libraries).
