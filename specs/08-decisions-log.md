# Decisions Log (ADRs)

Architecture Decision Records for Aya. Each entry captures **what** we decided, **why**, the
**alternatives** considered, and the **North Stars** it serves. New non-trivial decisions should
be appended here.

Status legend: `accepted` · `revisable` (a chosen default we'd happily revisit) · `superseded`.

---

## ADR-0001 — Photo-to-value is exactly two LLM calls
**Status:** accepted · **Date:** 2026-06-08

**Decision.** The entire pipeline is two LLM calls: ① a Claude vision **OCR** call producing
`Page.fullText`, then ② a Claude **analysis** call turning that text into an ordered `Phrase[]`.
Segmentation, pinyin, translation, and contextual meaning are all produced by call ②.

**Why.** Minimises round-trips and token cost while keeping a clean `fullText` ground truth for
debugging and OCR evals. *Fast & Efficient*, *Accurate*.

**Alternatives.** (a) A single mega-call doing OCR + all analysis — rejected: no independent OCR
ground truth, poor per-stage observability/evals. (b) A chain of discrete LLM micro-services
(separate calls for segmentation, entity extraction, language analysis) — rejected: multiplies
latency and cost for no quality gain. The originally-imagined separate "services" are kept as
*logical modules* in `packages/llm`, but collapsed to two model invocations.

---

## ADR-0002 — `Page` + `Phrase` as the domain model; tappability inferred
**Status:** accepted · **Date:** 2026-06-08

**Decision.** Two entities. `Page { id, fullText, createdAt }`. `Phrase { id, pageId, index,
original, pinyin, translation, contextualMeaning }`. Concatenating `original` in `index` order
reconstructs the page. Punctuation/whitespace are also `Phrase` rows with **null** analysis;
a token is tappable iff `pinyin !== null` — no separate `type` column.

**Why.** Smallest model that satisfies the reader, with a mechanical reconstruction invariant.
Keeping the schema minimal serves *Extensible* (additive growth) and *Reliable* (the invariant
guarantees faithful page rebuilds). *UX-Centric*: punctuation renders as plain non-tappable text.

**Alternatives.** A dedicated boolean/enum `type` field — rejected as unnecessary; null analysis
already encodes it. Separate token table for punctuation — rejected; over-normalised.

---

## ADR-0003 — Character breakdown & example sentence are out of MVP
**Status:** accepted · **Date:** 2026-06-08

**Decision.** The MVP popup ships pinyin, translation, and contextual meaning only. Per-character
breakdown and example sentences (mentioned in the PRD popup) are deferred.

**Why.** Keeps the scan output and schema lean for the first release. Both can be added
additively later (e.g. an embedded `characters` list and an `exampleSentence` field) without
disturbing the existing shape. *Fast & Efficient*, *Extensible*.

**Trade-off.** The MVP popup is less rich than the full PRD vision — accepted for MVP scope.

---

## ADR-0004 — Scan is one combined, stateless `POST /pages` endpoint
**Status:** accepted · **Date:** 2026-06-08

**Decision.** A single endpoint runs OCR → analysis server-side and returns `{ page, phrases }`.
It persists nothing.

**Why.** Simplest client, one round-trip. The orchestration stays on the server where the model
keys live. *UX-Centric* (one call, one loading state), *Reliable* (stateless, idempotent).

**Alternatives.** Two endpoints (`/ocr` then `/analyze`) for a progressive UI that shows raw text
before phrases — rejected for MVP: more client complexity for a marginal perceived-speed gain
within the ~15s budget. Revisit if perceived latency becomes a problem.

---

## ADR-0005 — Analysis is eager; no cross-session cache
**Status:** accepted · **Date:** 2026-06-08

**Decision.** All per-phrase analysis is computed **eagerly at scan time** and stored with the
page. There is **no shared cross-session/user cache** of phrase analyses.

**Why.** Eager analysis makes every tap instant — no network on tap (*UX-Centric*). No shared
cache keeps the system simple and avoids serving a cached translation that's wrong for a
different passage's context (*Reliable*, *Accurate*).

**Trade-off.** We re-analyse common phrases (e.g. frequent 成语) across scans rather than reusing
prior work — accepted for simplicity and contextual correctness. Revisit if cost data
(see [`05-observability.md`](./05-observability.md)) shows it's material.

---

## ADR-0006 — Local-first mobile; DynamoDB only on share
**Status:** accepted · **Date:** 2026-06-08

**Decision.** Scanned pages live on the device. We persist to DynamoDB **only** when a user
shares a page to the web reader, via `POST /shares`, which uploads the full page + phrases and
mints a short URL. The specific on-device store is out of scope for this architecture.

**Why.** The scan path stays stateless and cheap; the cloud only holds data a user chose to
share. *Fast & Efficient*, *Reliable*.

**Alternatives.** Persist every scan server-side — rejected: storage and write cost for data
that may never be shared, and no product need (no accounts, no history in MVP).

---

## ADR-0007 — AWS serverless stack; SST for IaC
**Status:** accepted (stack) · revisable (SST) · **Date:** 2026-06-08

**Decision.** Backend on **Lambda + API Gateway**; **DynamoDB** (single-table, on-demand) for
data; **S3** (presigned upload, ephemeral) for images. Infrastructure defined with **SST**.

**Why.** A bursty, one-heavy-request-per-photo workload with no session state fits serverless
scale-to-zero economics (*Fast & Efficient*) on managed, reliable primitives (*Reliable*). SST
is TypeScript-native and models the whole stack in-repo (*Extensible*).

**Alternatives.** Fargate/EC2 always-on server — rejected: pays while idle, more ops. CDK or
Serverless Framework instead of SST — viable; SST chosen as default, **revisable** if the team
prefers another IaC tool.

---

## ADR-0008 — Claude vision for OCR (no dedicated OCR engine)
**Status:** accepted · **Date:** 2026-06-08

**Decision.** Claude's vision capability performs OCR directly from the photo; no separate OCR
service (e.g. Textract/Google Vision).

**Why.** Single provider, simplest pipeline, and OCR can lean on the same model that understands
Chinese context. Matches the PRD. *Accurate*, *Fast & Efficient*, *Reliable* (fewer moving
parts).

**Alternatives.** Dedicated OCR + Claude for analysis — rejected for MVP: extra dependency, and
generic OCR isn't reliably better on printed Chinese book pages. Revisit if OCR evals fall short
of the ≥95% target.

---

## ADR-0009 — LangSmith for LLM observability and evals
**Status:** accepted · **Date:** 2026-06-08

**Decision.** LangSmith is the system of record for LLM traces, token cost, latency, and eval
runs. CloudWatch covers infra/API health.

**Why.** Native to our LangChain choice; one tool covers both the observability North Star
(cost/latency/quality) and evals-throughout-the-lifecycle. *Fast & Efficient* (measured cost),
*Accurate* (eval gating).

**Alternatives.** DIY (CloudWatch metrics via callbacks + a custom eval harness) — rejected:
significantly more to build/maintain. Hybrid split across two LLM tools — rejected: unnecessary
complexity. **Trade-off:** an external SaaS dependency, accepted.

---

## ADR-0010 — No authentication or authorization
**Status:** accepted · **Date:** 2026-06-08

**Decision.** The API has no auth. Endpoints are open; short-URL codes are unguessable but not
access-controlled.

**Why.** Security is explicitly out of scope per product direction; the MVP has no accounts and
no PII. Removing auth keeps the system simple and fast to build.

**Trade-off.** Anyone with a share code can read that page, and the API is publicly callable.
Accepted for now; **must be revisited before a public production launch** (see the PRD's privacy
note) — at minimum rate limiting and abuse protection on the LLM endpoints.
