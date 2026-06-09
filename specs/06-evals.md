# Evals

Accuracy is a North Star, and the only way to defend it is to **measure model quality
continuously**. Evals are not a one-off QA step — they run **throughout the LLM development
lifecycle**: while iterating on prompts locally, on every PR that touches `packages/llm`, and as
a periodic check against production drift.

Evals live in `packages/evals` and run against the same `runOcr` / `analyzeText` functions the
production API uses, recorded in **LangSmith** (datasets + eval runs).

## What we evaluate

The pipeline has four quality dimensions, each mapped to the relevant stage:

| # | Dimension | Stage | Scorer | Target |
|---|-----------|-------|--------|--------|
| 1 | **OCR character accuracy** | `runOcr` | Character Error Rate (CER) vs. gold `fullText` | ≥95% char accuracy on clear pages (PRD KPI) |
| 2 | **Segmentation quality** | `analyzeText` | Phrase-boundary F1 vs. gold segmentation; idiom-kept-whole rate | high boundary F1; idioms never split |
| 3 | **Pinyin correctness** | `analyzeText` | Deterministic check against a pinyin library | near-100% on common vocabulary |
| 4 | **Translation / contextual quality** | `analyzeText` | LLM-as-judge rubric (faithfulness, contextual correctness, fluency) | meets rubric threshold |

Plus one **structural invariant** checked on every eval example (and in production): the
**reconstruction check** — `tokens.join("") === fullText`. A failure here is an automatic fail,
independent of the quality scores (North Star: *Reliable*).

## Datasets

Stored as versioned fixtures in `packages/evals/datasets/` and mirrored as LangSmith datasets:

- **OCR set:** real photos of Simplified-Chinese book pages (varied lighting, fonts, angles)
  paired with a human-verified gold `fullText`. Includes the hard PRD cases: blurry images,
  pages with no Chinese text.
- **Segmentation/analysis set:** passages of `fullText` paired with gold phrase boundaries and
  expected pinyin, with special attention to four-character idioms (成语), compounds, and proper
  nouns.
- **Translation set:** phrases in passages where context changes meaning, with reference
  notes for the judge rubric.

Start small but real (the PRD calls for testing with real literary text early) and grow the
sets as we discover failure cases — every production bug becomes a new eval example.

## Scorers

- **CER (OCR):** edit distance between predicted and gold `fullText`, normalised by length.
- **Boundary F1 (segmentation):** precision/recall on phrase boundaries vs. gold; plus an
  explicit "idiom split" counter that must stay at zero.
- **Pinyin check:** deterministic — compare model pinyin to a pinyin library's output for the
  same characters; flags mismatches for review (handles polyphones as known exceptions).
- **LLM-as-judge (translation):** a rubric prompt scoring faithfulness, contextual correctness,
  and fluency on a fixed scale. Run with `temperature: 0` for repeatability; the judge model id
  is config.

## Lifecycle integration

```
local iteration ──▶ PR (CI gate) ──▶ production ──▶ periodic drift check
   run evals          evals must         traced         re-run evals on
   on a subset        not regress        in LangSmith    sampled prod inputs
```

- **Local:** `npm run eval -w packages/evals` (optionally a fast subset) while editing prompts.
- **CI gate:** any PR touching `packages/llm` (prompts, schemas, model config) **must** run the
  eval suite. Scores below threshold, or any regression beyond a tolerance vs. the baseline,
  **fail the build.** This is the mechanism that enforces "no prompt change without an eval."
- **Drift:** periodically sample real (shared) production pages, re-score, and compare to
  baseline to catch model/version drift over time.

## Reporting

Eval runs are recorded in LangSmith with the same `stage`/`model`/`env` tags as production
traces, so quality, cost, and latency can be read on one pane of glass. A run summarises:
CER, boundary F1, idiom-split count, pinyin mismatch rate, judge score distribution, and the
reconstruction pass rate — versus the previous baseline.

> **Rule of thumb:** if a change can move any of the four dimensions above, it needs an eval
> run before merge. Accuracy is not negotiable (see [`00-north-stars.md`](./00-north-stars.md)).
