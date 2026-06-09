# Aya — Technical Architecture

This folder is the **source of truth for how Aya is built**. It defines the guiding
principles (our North Stars) and the concrete technical decisions that flow from them.

Aya is a **Chinese Reading Companion**: an intermediate Mandarin learner photographs a
page of a physical Simplified-Chinese book, and Aya extracts the text, segments it into
meaningful *phrases* (idioms and compounds kept whole), and lets the reader tap any phrase
for pinyin, translation, and contextual meaning. See
[`docs/reading-companion-prd.md`](../docs/reading-companion-prd.md) for the product spec.

## How to use these documents

1. **Start with [`00-north-stars.md`](./00-north-stars.md).** Every technical decision in
   this repo must visibly serve at least one North Star and contradict none of them. If a
   proposed change can't be justified against them, it doesn't ship.
2. Read [`01-system-overview.md`](./01-system-overview.md) for the big picture.
3. Drill into the area you're working on (data, API, LLM, observability, evals, deploy).
4. When you make a non-trivial decision, **record it** in
   [`08-decisions-log.md`](./08-decisions-log.md) as an ADR, referencing the North Stars.

## Index

| Doc | What it covers |
|-----|----------------|
| [`00-north-stars.md`](./00-north-stars.md) | The five principles every decision must serve |
| [`01-system-overview.md`](./01-system-overview.md) | Components, the two-call flow, monorepo layout |
| [`02-data-model.md`](./02-data-model.md) | `Page`/`Phrase` model + DynamoDB single-table design |
| [`03-api-design.md`](./03-api-design.md) | REST endpoints, contracts, upload + share flows |
| [`04-llm-pipeline.md`](./04-llm-pipeline.md) | OCR + analysis chains, prompts, structured output |
| [`05-observability.md`](./05-observability.md) | LangSmith + CloudWatch: cost, latency, quality |
| [`06-evals.md`](./06-evals.md) | Datasets, scorers, CI integration across the lifecycle |
| [`07-monorepo-and-deployment.md`](./07-monorepo-and-deployment.md) | Packages, SST/AWS, environments |
| [`08-decisions-log.md`](./08-decisions-log.md) | ADR-style record of decisions and their rationale |

## Status

- **Version:** 0.1 (initial architecture)
- **Date:** 2026-06-08
- **Scope:** MVP (Phase 1 reader) + Phase 2 (shareable web reader). See the PRD for phasing.

These documents are a **living starting point**, not a frozen contract. Update them as the
system evolves — and keep the decisions log honest about *why* things changed.
