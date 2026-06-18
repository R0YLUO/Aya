# LLM Pipeline

All model interaction lives in `packages/llm`, isolated behind two functions — `runOcr` and
`analyzeText` — so the rest of the system never imports LangChain or knows which model/provider is
in use (North Star: *Extensible*). The pipeline is deliberately **two calls, end to end**.

```
image (S3) ──①──▶ runOcr ──▶ fullText ──②──▶ analyzeText ──▶ Phrase[]
                  (vision OCR)            (structured output)
```

- **Library:** LangChain (TypeScript).
- **Provider-agnostic:** the chat model is built by LangChain's universal `initChatModel`, so the
  **provider** (`anthropic` / `google-genai` / `openai`) and **model id** are config, not code. The
  default is Anthropic vision; switching to Gemini/OpenAI is a config change (see ADR-0012).
- **Tracing/evals:** every call runs under LangSmith (see [`05-observability.md`](./05-observability.md)
  and [`06-evals.md`](./06-evals.md)).

## Model configuration

Provider, model id, temperature, and max tokens are **configuration, not hard-coded**, so we can
switch providers, upgrade models, or tune per-stage without touching call sites. A single
`PROVIDERS` table (the only place provider names appear in source) records each provider's API-key
env var, whether it accepts `temperature`, and its token-ceiling field name.

```ts
// packages/llm/src/config.ts (illustrative) — loadLlmConfig resolves a per-stage ModelSpec
// from AYA_LLM_PROVIDER (+ optional AYA_OCR_PROVIDER/AYA_ANALYSIS_PROVIDER overrides),
// AYA_OCR_MODEL / AYA_ANALYSIS_MODEL, and the selected provider's key env var.
{
  ocr:      { provider: "anthropic", model: env.AYA_OCR_MODEL,      temperature: 0, maxTokens: 4096, … },
  analysis: { provider: "anthropic", model: env.AYA_ANALYSIS_MODEL, temperature: 0, maxTokens: 8192, … },
}
```

`temperature: 0` for both — we want determinism and reproducibility for an accuracy-critical,
eval-gated pipeline (North Stars: *Accurate*, *Reliable*). Whether `0` is actually sent is
per-provider (`sendTemperature`): current Anthropic models reject the param; Gemini/OpenAI accept it.

> When choosing or updating a model id, consult the `claude-api` skill / the provider's current
> model list rather than hard-coding from memory. Provider + model id are env config, never literals.

## Comparing providers/models

Because the pipeline is provider-agnostic and prompts/schemas are shared, the **same** eval datasets
and scorers can be run against multiple models on identical inputs. `npm run eval:compare -w
packages/evals` runs the suite once per model in `packages/evals/models.compare.json` and prints one
side-by-side table — the data we use to decide whether a provider swap holds quality (North Star:
*Accurate*; see [`06-evals.md`](./06-evals.md) and ADR-0012).

---

## Call ① — OCR (`runOcr`)

**Input:** the image (fetched from S3 by the API, passed to the chain as a vision message).
**Output:** `fullText: string` — the raw Simplified-Chinese text, line breaks preserved.

**Responsibilities:**
- Extract printed Simplified-Chinese text faithfully, preserving punctuation and line breaks.
- Signal the two failure modes explicitly so the API can return the right PRD error:
  - image unreadable / too blurry → `image_unreadable`
  - no Chinese text present → `no_chinese_text`

To make those signals reliable, the OCR call returns **structured output**, not free text:

```ts
const OcrResult = z.object({
  status: z.enum(["ok", "unreadable", "no_chinese_text"]),
  fullText: z.string(),          // "" when status !== "ok"
});
```

**Prompt intent (not the literal prompt):**
> You are an OCR engine for printed Simplified-Chinese book pages. Transcribe the text exactly
> as printed, preserving original line breaks and punctuation. Do not translate, correct, or
> summarise. If the image is too blurry/dark to read confidently, return `status:"unreadable"`.
> If there is no Simplified-Chinese text, return `status:"no_chinese_text"`.

`fullText` becomes `Page.fullText` and is the ground-truth artifact the OCR evals score against.

---

## Call ② — Analysis (`analyzeText`)

**Input:** `fullText`.
**Output:** an ordered `Phrase[]` — the page tokenised and analysed, eagerly and in one shot.

This single call does **segmentation + language analysis + translation** together, with the
**full passage in context** (PRD requirement: segmentation must consider the whole passage, not
phrase-by-phrase). It uses LangChain's structured-output binding against a Zod schema so the
model returns validated JSON, never prose we have to parse (North Star: *Reliable*).

```ts
const PhraseToken = z.object({
  index: z.number().int().positive(),
  original: z.string(),
  // analysis present for words; null for punctuation/whitespace tokens
  pinyin: z.string().nullable(),
  translation: z.string().nullable(),
  contextualMeaning: z.string().nullable(),
});

const AnalysisResult = z.object({
  tokens: z.array(PhraseToken),
});
```

**Prompt intent (not the literal prompt):**
> You are a Mandarin reading tutor. Given a passage of Simplified Chinese, split it into an
> ordered list of tokens that, when concatenated in order, reproduce the input **exactly**
> (including every punctuation mark and line break). Group characters into **meaningful
> phrases** — keep four-character idioms (成语), compound words, and proper nouns whole; never
> split by single character unless the character truly stands alone. For each **word** token,
> provide `pinyin` (with tone marks), a standard `translation`, and a `contextualMeaning`
> describing how it is used *in this passage*. For **punctuation/whitespace** tokens, set
> `pinyin`, `translation`, and `contextualMeaning` to null. Number tokens with `index` starting
> at 1.

**Post-processing & validation in `analyzeText`:**
1. Parse with the Zod schema (structured output).
2. **Reconstruction check:** assert `tokens.map(t => t.original).join("") === fullText`. If it
   fails, retry once with the discrepancy fed back; if it still fails, surface `analysis_failed`.
   This guarantees the `index`-ordering invariant the data model and API depend on.
3. Assign `id` (uuid) and `pageId` to each token to produce `Phrase[]`.

The reconstruction check is the linchpin of correctness: it mechanically guarantees the reader
can rebuild the page and that no text was dropped or hallucinated (North Stars: *Accurate*,
*Reliable*).

---

## Why two calls, not one or many

- **Not one mega-call:** keeping OCR separate gives us a clean `fullText` ground truth to
  evaluate OCR independently and to debug analysis failures against real input.
- **Not a long chain of micro-services:** segmentation, pinyin, translation, and contextual
  meaning are all produced by call ②. Splitting them into separate LLM calls would multiply
  latency and token cost for no quality gain (North Star: *Fast & Efficient*).

See [ADR-0001](./08-decisions-log.md) for the full rationale.

## Error handling & resilience

| Failure | Handling |
|---------|----------|
| OCR `unreadable` / `no_chinese_text` | Map to `422` PRD error; no analysis call made |
| Structured output parse failure | One bounded retry; then `analysis_failed` (`502`) |
| Reconstruction check failure | One retry with feedback; then `analysis_failed` |
| Transient model/network error | Bounded retries with backoff inside the chain |

Retries are **bounded** to protect the latency budget and cost — we fail clearly rather than
spin (North Stars: *Reliable*, *Fast & Efficient*).
