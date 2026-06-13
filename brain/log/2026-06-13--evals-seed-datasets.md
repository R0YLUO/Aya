---
title: "evals-seed-datasets: small-but-real OCR/analysis/translation seed fixtures"
type: log
packages: [evals]
tasks: [evals-seed-datasets]
summary: Seeded the three eval sets — enriched OCR (literary passages + idiom/proper-noun pages + the PRD unreadable/no-Chinese cases) and analysis (idioms kept whole, compounds, 鲁迅 proper noun) fixtures, and added a brand-new translation set (context-dependent phrases + judge rubric notes) with its own Zod schema + loader. 23 offline tests pass.
updated: 2026-06-13
---

# evals-seed-datasets

Grew the scaffold's minimal fixtures into small-but-real seed sets and introduced the
translation set the scaffold didn't have.

- **OCR** (`datasets/ocr/v1.json`, 5 examples): real-ish literary passages (a multi-line
  鲁迅 page, an idiom-pair page), keeping line breaks + punctuation, plus the hard PRD cases
  `ocr-unreadable-001` (`status: unreadable`, empty fullText) and `ocr-no-chinese-001`
  (`status: no_chinese_text`). Image refs stay placeholder S3 URLs until real photos land.
- **Analysis** (`datasets/analysis/v1.json`, 4 examples): segmentation gold emphasising
  四字成语 kept whole (`画蛇添足`, `弄巧成拙`), compounds (`天气`/`公园`/`散步`), and a proper
  noun (`鲁迅`), each with `goldPinyin`. Every example still satisfies
  `goldBoundaries.join('') === fullText`.
- **Translation** (`datasets/translation/v1.json`, 5 examples — NEW): context-dependent
  phrases (`意思` as a gift token, `东西` as "things", `老是` as "always", `算了` as "forget
  it", the 成语 `不择手段`). Each carries a context-free `referenceTranslation`, the
  `referenceContextualMeaning` to reward, and `rubricNotes` for the (deferred) LLM-as-judge.

## Code changes

- `src/datasets.ts`: added `TranslationExampleSchema` / `TranslationDatasetSchema` (refine:
  `fullText.includes(phrase)`) + `loadTranslationDataset(version)`. Exported via `index.ts`.
- `src/run-evals.ts`: loads + validates the translation set on every run (fails loudly on a
  bad fixture), registers it to LangSmith when enabled, and reports
  `EvalReport.translation.exampleCount`. Scoring is deferred — no judge scorer yet.

## Verification

Real (offline): `@aya/evals` typecheck + lint + build pass; repo-wide `typecheck` + `lint`
pass; 23 `node --test` cases pass (added translation-load + phrase-in-fullText reject tests,
an idiom-kept-whole assertion, and a translation-count assertion in the runner test).
`npm run eval` runs end-to-end with no keys — all three fixtures load; report shows
"Translation: 5 examples loaded (judge scorer deferred)".

**Gated**: the LLM-as-judge translation scorer and any real model/LangSmith run remain gated
on the existing [anthropic-api-key](../handoffs/anthropic-api-key.md) and
[langsmith-account](../handoffs/langsmith-account.md) handoffs — no new handoff needed
(this task only seeds data; it does not unblock those).

## Brain pages touched

- Updated `brain/packages/evals.md` (three datasets, translation schema/loader, runner change).
