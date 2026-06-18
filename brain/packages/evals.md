---
title: "@aya/evals"
type: package
packages: [evals]
tasks: [evals-package-scaffold, evals-seed-datasets, evals-scorer-cer, evals-scorer-segmentation, evals-scorer-pinyin, evals-scorer-translation-judge, evals-reconstruction-and-report, ci-evals-gate, llm-provider-abstraction]
summary: Eval workspace — versioned JSON datasets (OCR, analysis/segmentation, translation), deterministic scorers (CER scoreCER/summariseCer with ≥95% target flagging, scoreSegmentation = boundary precision/recall/F1 + idiom-split hard-fail, scorePinyin/summarisePinyin = library-reference pinyin check with polyphone exceptions, reconstruction) plus an LLM-as-judge translation scorer (scoreTranslation), an offline-capable PROVIDER-AGNOSTIC runner over the real runOcr/analyzeText (+ judge), a six-metric aggregate report compared against a stored baseline, a side-by-side model-comparison CLI (eval:compare / runEvalsMatrix), and optional LangSmith dataset registration. `npm run eval` works locally with no keys.
updated: 2026-06-18
---

# @aya/evals (as built)

Scaffolded by `evals-package-scaffold`. Runs the **same** `runOcr` / `analyzeText`
the production API uses (imported from `@aya/llm`), scores them with deterministic
local scorers, and prints a summary. LangSmith is a soft dependency — the suite runs
fully offline when its env is absent.

## Status

- Package, datasets, scorers (incl. the LLM-as-judge translation scorer), runner, the
  six-metric report + baseline gate, and LangSmith wiring all built and unit-tested
  **offline** (69 node:test cases). The model stages — OCR, analysis, **and the judge** —
  have **never run against the real Anthropic API**, so the baseline's metric VALUES are
  placeholders (its gates are real) and no dataset has been pushed to a real LangSmith
  project — both gated on existing handoffs (anthropic-api-key, langsmith-account).

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
  zero network (tests), else `buildJudgeRunner` `await`s a real `createStructuredRunner` from
  `loadJudgeConfig(env)` — now **provider-agnostic**, returning a `ModelSpec` for
  **`AYA_JUDGE_PROVIDER`** (→ `AYA_LLM_PROVIDER`) + **`AYA_JUDGE_MODEL`** (never hard-coded,
  golden rule #9) at fixed temperature 0. Pinning `AYA_JUDGE_PROVIDER` keeps the judge fixed
  while candidate models vary in `eval:compare`. `buildJudgeSystemPrompt` /
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
  says "skipped". Model stages now gate on **`hasModelCredentials(env)`** (the selected
  provider's key — provider-agnostic), not a hard `ANTHROPIC_API_KEY` check. The translation
  set is **loaded/validated on every run** (and registered to LangSmith when enabled) and
  **judged when possible**: the judge stage runs when a `judgeRunner` is injected OR
  (`hasModelCredentials` for the judge provider AND `AYA_JUDGE_MODEL`) — grading each example's
  `referenceContextualMeaning` as the candidate. The report's
  `translation` block carries `exampleCount`, `rows[]` (per-dimension scores + `pass`),
  `passRate`, `threshold`, and now a `scoreDistribution` (mean of each judge dimension — the
  sixth headline metric); `printReport` prints the pass rate + the dimension means or a "judge
  skipped" line. Each `AnalysisEvalRow` now carries a `passed` boolean = `reconstructionOk`:
  the **reconstruction invariant is the hard gate** — a reconstruction failure (`analyzeText`
  threw `AnalysisFailedError`) marks the example failed regardless of segmentation/pinyin
  quality (specs/06-evals.md). `printReport` prints a per-example reconstruction ✓/✗ line.
  The CLI no longer hand-rolls the idiom-split exit — it loads `baseline.json`, runs
  `compareToBaseline(extractMetrics(report), baseline)`, prints the comparison, and exits
  non-zero on any finding (the idiom-split ceiling-0 and reconstruction floor-1.0 gates
  subsume the old check).
- `src/report.ts` — the **baseline gate** (specs/06-evals.md "Reporting"). `extractMetrics(report)`
  flattens the six headline metrics from an `EvalReport` (OCR mean char accuracy, analysis mean
  boundary F1, total idiom splits, pinyin mismatch rate, reconstruction pass rate, translation pass
  rate + judge score distribution); a **skipped stage** (no rows) becomes `null` so a baseline never
  forces a stage to have run. `loadBaseline()` reads/validates `datasets/baseline.json`
  (`BaselineSchema` — recorded `metrics` + per-metric `gates`). `compareToBaseline(metrics, baseline)`
  → `{ ok, findings[], skipped[] }`: each scalar metric is gated by a `MetricGate`
  (`direction: 'higher'|'lower'`, `tolerance` = allowed slack vs baseline before it counts as a
  regression, optional `threshold` = absolute floor for `higher` / ceiling for `lower`); the judge
  distribution gates each of the three dimensions with one shared gate. A finding is either a
  `regression` (moved past baseline ± tolerance) or a `threshold` breach. `null` (skipped) metrics
  go to `skipped` and are NOT gated — that is why the offline `npm run eval` (all model stages
  skipped) still exits 0. `printComparison` prints PASS / the findings.
- `datasets/baseline.json` — the stored baseline (sibling of the versioned dataset dirs, loaded by
  `findDatasetsDir`, now exported from `datasets.ts`). Its metric VALUES are placeholders pending the
  first real Anthropic run (encode PRD/spec bars, not observed scores); its GATES are the real CI
  knobs — idiom splits ceiling 0 (tolerance 0), reconstruction floor 1.0, OCR floor 0.95, plus
  per-metric regression tolerances.
- `src/compare.ts` — the **side-by-side model comparison** harness (the payoff of the
  provider-agnostic LLM layer, [[llm-provider-abstraction]]). `runEvalsMatrix(configs, options)`
  runs `runEvals` once per `{ label, env }` config (sequentially; shared injected runners/options
  apply to all, only `env` differs) and returns labelled reports; `printMatrix` prints ONE
  side-by-side table (OCR char/status acc, boundary F1, idiom splits, reconstruction, pinyin
  mismatch, judge pass rate + 3 dimension means) — "skipped" cells when a model lacks creds.
  `loadCompareConfig` reads `models.compare.json`; an `isMain()` CLI (`npm run eval:compare`)
  prints the table. Keys come from the ambient env — the JSON holds no secrets.
- `models.compare.json` — committed template listing the models to compare (provider + model
  ids only, `<...>` placeholders for ids). Sits at the package root (loaded by a walk-up finder).
- `src/index.ts` — barrel re-exporting datasets, scorers, pinyin, translation (judge),
  langsmith, runner, the report/baseline gate, and the compare harness.

## Model comparison (eval:compare)

`npm run eval:compare -w packages/evals` answers "is Gemini as good as Claude here?" with data:
it runs the **same** datasets + scorers against every model in `models.compare.json` on identical
inputs and prints one table. Because prompts/schemas are shared and only provider/model env
differs, the comparison is apples-to-apples. Offline (no provider keys) every column is "skipped"
— the wiring is verifiable without network; real numbers need the [[multi-provider-keys]] handoff.

## CI gate (ci-evals-gate)

The accuracy gate is wired in `.github/workflows/evals.yml` (NOT in `ci.yml`, whose core
typecheck/lint/build must run on every PR). It is **path-filtered at the trigger level** to
`packages/llm/**`, `packages/evals/**`, `packages/shared/**`, so the job is skipped entirely on
unrelated PRs. On a matching PR/push it runs `npm run test -w @aya/evals` (the deterministic
baseline-gate self-tests — where the "simulated regression fails / passing run succeeds"
guarantee lives, via `report.test.ts`) then `npm run eval -w packages/evals` (real model path
when `ANTHROPIC_API_KEY` secret + model-id vars are set; else skipped stages, still exits 0).
See `brain/concepts/ci-pipeline.md` for the full as-built description and the `ci-first-run`
handoff for the pending real run.

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
