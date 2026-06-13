---
title: "evals-scorer-translation-judge: LLM-as-judge translation scorer"
type: log
packages: [evals]
tasks: [evals-scorer-translation-judge]
summary: Added src/translation.ts — scoreTranslation(phrase, context, candidate, referenceNotes) runs a second Claude call grading three fixed rubric dimensions (faithfulness/contextualCorrectness/fluency, integer 1–5) + rationale at temperature 0 with an env-sourced judge model id (AYA_JUDGE_MODEL), then applies a per-dimension pass threshold (default 4). Wired into run-evals' translation stage (judged when a judgeRunner is injected OR ANTHROPIC_API_KEY+AYA_JUDGE_MODEL present). 10 new offline tests; 56 evals tests pass.
updated: 2026-06-13
---

# evals-scorer-translation-judge

Implemented the fourth eval dimension (specs/06-evals.md): translation/contextual
quality, graded by an LLM-as-judge rubric rather than a deterministic library check.

## What I built

- `packages/evals/src/translation.ts`:
  - `JudgeRubricSchema` — Zod object with `faithfulness`, `contextualCorrectness`,
    `fluency` as **integers 1–5** plus a free-text `rationale`.
  - `scoreTranslation(phrase, context, candidate, referenceNotes, options)` →
    `TranslationScore` (the three scores, the rationale, the `threshold`, and a `pass`
    boolean that is true iff EVERY dimension ≥ threshold). Default threshold 4/5;
    overridable per call.
  - `loadJudgeConfig(env)` — resolves the judge stage from env: **`AYA_JUDGE_MODEL`**
    (never hard-coded; golden rule #9) + `ANTHROPIC_API_KEY`, fixed `temperature: 0`.
  - `buildJudgeSystemPrompt` / `buildJudgeUserMessage` — diffable string builders;
    no model id baked into the prompt.
  - Same DI/lazy-config pattern as `@aya/llm`: an injected `runner`
    (`StructuredRunner<JudgeRubric>`) grades fixed output with zero network for tests;
    otherwise `buildJudgeRunner` lazily builds a real `createStructuredRunner` from
    `loadJudgeConfig`. Output is `withRetry`-wrapped (maxAttempts 2) and defensively
    re-parsed with `JudgeRubricSchema` even though the runner validated.
- Wired into `run-evals.ts`: a `judgeRunner` option + `judgeThreshold`, a
  `scoreTranslationExample` that grades each example's `referenceContextualMeaning` as
  the candidate, and a `canRunJudge` gate (injected runner OR
  `ANTHROPIC_API_KEY` + `AYA_JUDGE_MODEL`). `EvalReport.translation` now carries
  `rows[]` / `passRate` / `threshold` alongside `exampleCount`; `printReport` prints the
  pass rate or a "judge skipped" line.
- Exported the new API from the barrel.

## Key decisions

- **Reused `@aya/llm`'s `createStructuredRunner` / `withRetry` / `StructuredRunner`**
  rather than introduce a new LangChain surface in evals — keeps LangChain isolated
  (dependency rule holds: evals → llm + shared only) and gives the judge the same
  structured-output + retry + defensive-re-parse recipe every LLM call follows.
- **Separate judge model id** (`AYA_JUDGE_MODEL`) distinct from the OCR/analysis stage
  models, so the judge can run on a different model than the pipeline it grades.
- The judge grades `referenceContextualMeaning` (the contextual reading we *want* the
  model to produce) as the candidate — when the real analysis path is wired through
  evals, the candidate becomes the model's own translation/contextual meaning.

## Verification

- `npm run test -w @aya/evals` — 56 tests pass (10 new: out-of-scale/non-integer rubric
  rejection, dimension list, score parsing, all-dimensions-pass threshold logic, custom
  threshold flips verdict, message construction carries phrase/context/candidate/notes,
  defensive re-parse rejects bad runner output, loadJudgeConfig reads model id + fixes
  temperature 0 + throws on missing, deterministic prompt builders).
- `npm run typecheck && npm run lint && npm run build` — all green (full-repo typecheck
  green: the changed `EvalReport.translation` shape ripples only inside evals).
- `npm run eval -w @aya/evals` — runs offline; the Translation section now prints
  "judge skipped (no judge runner / ANTHROPIC_API_KEY + AYA_JUDGE_MODEL)".
- All offline against an injected mock judge. **No real Anthropic call** — the judge has
  never hit the live API; folded into the existing `anthropic-api-key` handoff (now
  updated to name the judge + `AYA_JUDGE_MODEL` and add the eval-pass-rate verify step).
  No new handoff needed.
