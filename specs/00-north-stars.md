# North Stars

These five principles guide every technical decision in Aya. They are listed in no strict
priority order — most good decisions serve several at once. When two pull against each
other, **say so explicitly in the decisions log and choose deliberately.**

> **Prime directive:** Every non-trivial technical decision must visibly serve at least one
> North Star and contradict none of them. If you can't justify a choice against these, it
> doesn't ship.

---

## 1. Fast & Efficient

Aya should feel quick and cost as little as possible to operate.

**What this means concretely:**
- Minimise the number of LLM round-trips. The entire photo-to-value path is **two LLM calls**
  (OCR, then analysis) — not a chain of micro-services calling the model repeatedly.
- Pay only for what we use: serverless compute that scales to zero (Lambda), no always-on
  infrastructure for a bursty, one-request-per-photo workload.
- Don't persist or compute what we don't need. The scan path is **stateless**; we write to
  the cloud database only when a user shares a page to the web reader.
- Track token cost per scan continuously so "efficient" is measured, not assumed.

**Anti-patterns:** chatty multi-call LLM pipelines; analysing data nobody will read for its
own sake; idle servers; unmeasured spend.

---

## 2. User-Experience-Centric

The reading experience comes first. The technology exists to remove friction, not add it.

**What this means concretely:**
- The reader sees clean, tappable phrases — never raw characters, never an image overlay.
- Taps are **instant**: all per-phrase analysis is computed eagerly at scan time and stored,
  so opening the popup never waits on the network.
- Clear, actionable error states (blurry photo → "retake"; no Chinese text → "try again").
- A loading state during the ~15s processing budget; the UI never freezes.
- Reading continues across devices: scan on the phone, keep reading on the web via a short URL.

**Anti-patterns:** spinners on every tap; cryptic errors; UI jank on long pages; forcing the
user to understand the system's internals.

---

## 3. Extensible

Today it's a reading companion for Simplified Chinese. The architecture should make tomorrow's
features cheap to add (vocab saving, audio, traditional script, new languages).

**What this means concretely:**
- One backend serves **both** the mobile app and the web reader through the **same REST API**
  and the **same shared types** — no divergence between clients.
- LLM logic (prompts, chains, output schemas) lives in its own package, isolated behind clear
  interfaces, so a model swap or a new analysis field is a localised change.
- TypeScript end-to-end with shared domain types and Zod-validated contracts, so a change to
  the `Phrase` shape ripples through the type system instead of failing silently in production.
- The data model is small and additive: new fields and new entities slot in without rewrites.

**Anti-patterns:** client-specific backends; prompts copy-pasted across packages; duplicated
or drifting type definitions; schemas that need migration for every new feature.

---

## 4. Reliable & Stable

Aya should behave predictably and degrade gracefully.

**What this means concretely:**
- The LLM returns **structured, validated output** (Zod-checked). Malformed model responses
  are caught and surfaced as clean errors, never rendered as garbage.
- Explicit handling of the known failure modes from the PRD: unreadable photo, no Chinese
  text, network failure on upload — each with a defined response and retry path.
- Idempotent, stateless request handling on the scan path; persistence only at the share step
  where it's intentional.
- Managed AWS primitives (Lambda, API Gateway, DynamoDB, S3) so we lean on proven uptime
  rather than operating our own hosts.

**Anti-patterns:** trusting raw LLM text; unhandled edge cases; hidden state; hand-rolled infra
we have to babysit.

---

## 5. Accurate

The product is only trustworthy if the Chinese is right.

**What this means concretely:**
- OCR targets **≥95% character accuracy** on clear printed pages (PRD KPI), measured by evals.
- Segmentation keeps idioms (成语), compounds, and proper nouns **whole**, decided with full
  passage context — never naive character-by-character splitting.
- Translations are **contextual**: meaning reflects the surrounding passage, not just a
  dictionary gloss. We store both a `translation` and a `contextualMeaning`.
- **Evals run throughout the LLM lifecycle** (OCR accuracy, segmentation boundaries, pinyin
  correctness, translation quality) and gate changes to prompts and chains in CI.

**Anti-patterns:** shipping prompt changes without an eval run; character-level segmentation;
dictionary-only translations that ignore context; "looks fine to me" as a quality bar.

---

## Using the North Stars in review

When reviewing a change (human or autonomous), ask:

- Which North Star(s) does this serve? (If none — why are we doing it?)
- Does it weaken any other North Star? (If so, is the trade-off recorded and accepted?)
- For anything touching the LLM: **is there an eval?** (Accuracy is non-negotiable.)
- For anything touching cost or latency: **is it measured?** (See [`05-observability.md`](./05-observability.md).)
