# Data Model

The domain is deliberately tiny: a **`Page`** (the text of one photographed page) and its
ordered **`Phrase`**s (the tokens that make it up). A third concept, the **`Share`**, exists
only to back the short-URL web reader. Small and additive by design (North Star: *Extensible*).

## Logical model

### `Page`
| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` (uuid v4) | Primary identifier |
| `fullText` | `string` | Raw text from the OCR call, line breaks preserved. Ground truth for debugging and evals. |
| `createdAt` | `string` (ISO 8601) | Set when the page is created |

### `Phrase`
| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` (uuid v4) | Primary identifier |
| `pageId` | `string` (uuid) | The `Page` this phrase belongs to |
| `index` | `number` (int, 1-based) | Position in the page. **Concatenating every phrase's `original` in ascending `index` order reconstructs `fullText` exactly**, including punctuation and line breaks. |
| `original` | `string` | The original Simplified-Chinese text of this token. For punctuation/whitespace tokens, this is the literal punctuation or newline. |
| `pinyin` | `string \| null` | Pinyin with tone marks. `null` for non-word tokens (punctuation, whitespace). |
| `translation` | `string \| null` | Standard English translation of the phrase. `null` for non-word tokens. |
| `contextualMeaning` | `string \| null` | How the phrase is used *in this passage* ("as used here, this means…"). `null` for non-word tokens. |

**Tappability is inferred, not stored.** A token is tappable iff its analysis is present
(`pinyin !== null`). Punctuation and newline tokens carry `null` analysis and render as plain,
non-interactive text. This keeps the schema exactly as specified — no extra `type` column —
while preserving the reconstruction invariant (North Stars: *UX-Centric*, *Reliable*).

> **MVP note.** Per-character breakdown and example sentences (mentioned in the PRD popup) are
> **out of MVP scope** by decision (see [ADR-0003](./08-decisions-log.md)). They would be added
> additively later — likely as an embedded `characters` list and an `exampleSentence` field on
> `Phrase` — without disturbing the existing shape.

### `Share`
| Field | Type | Notes |
|-------|------|-------|
| `code` | `string` | Short, URL-safe code (e.g. 8-char base62 / nanoid). The public identifier in `/s/{code}`. |
| `pageId` | `string` (uuid) | The page this share points to |
| `createdAt` | `string` (ISO 8601) | When the share was minted |

### Relationships
```
Page 1 ──── * Phrase        (phrase.pageId → page.id, ordered by phrase.index)
Page 1 ──── * Share         (a page can be shared; share.pageId → page.id)
```

## TypeScript shape (lives in `packages/shared`)

These types are the single definition used by the API, the web reader, and the mobile client.
They are paired with Zod schemas so the same definition validates API payloads and LLM output.

```ts
export interface Page {
  id: string;
  fullText: string;
  createdAt: string; // ISO 8601
}

export interface Phrase {
  id: string;
  pageId: string;
  index: number;             // 1-based; sort by this to reconstruct the page
  original: string;
  pinyin: string | null;            // null ⇒ non-word token (non-tappable)
  translation: string | null;
  contextualMeaning: string | null;
}

export interface Share {
  code: string;
  pageId: string;
  createdAt: string;
}

export interface AnalyzedPage {
  page: Page;
  phrases: Phrase[];         // ordered by index
}
```

## Physical model: DynamoDB single-table design

We use **one DynamoDB table** (`aya-<stage>`). DynamoDB is key-value/document-oriented, so we
model the logical relationships as key prefixes rather than foreign keys + joins. This gives us
the one access pattern that matters most — *"fetch a page and all its phrases, in order, in a
single query"* — as a single partition read (North Stars: *Fast*, *Reliable*).

### Keys

| Entity | PK (partition key) | SK (sort key) | Other attributes |
|--------|--------------------|---------------|------------------|
| Page   | `PAGE#<pageId>` | `META` | `fullText`, `createdAt`, `entityType: "Page"` |
| Phrase | `PAGE#<pageId>` | `PHRASE#<index padded>` | `id`, `index`, `original`, `pinyin`, `translation`, `contextualMeaning`, `entityType: "Phrase"` |
| Share  | `SHARE#<code>` | `META` | `pageId`, `createdAt`, `entityType: "Share"` |

`index padded` = the integer left-padded to a fixed width (e.g. `PHRASE#000001`) so DynamoDB's
lexicographic sort-key ordering matches numeric order. A page is therefore stored as one `META`
item plus N phrase items under the **same partition key**.

### Access patterns

| # | Need | Query |
|---|------|-------|
| 1 | Get a page with all phrases in order | `Query PK = PAGE#<pageId>` → returns `META` + all `PHRASE#…` items, already sorted by index |
| 2 | Resolve a short code → page | `GetItem PK = SHARE#<code>, SK = META` → `pageId`, then run pattern #1 |
| 3 | Persist a shared page | `BatchWrite`/`TransactWrite`: the `Page` META item, all `Phrase` items, and the `Share` item together |

Patterns 1–3 are everything the product needs. No secondary indexes (GSIs) are required for the
MVP; we are not listing pages by user (there are no users) or querying phrases independently.

### Why this honours the relational spec

The user-facing model is still "a Page has many Phrases (ordered by `index`) and may have
Shares" — exactly the relational description. DynamoDB's single-table keying is just the
*physical* realisation that makes the dominant read a one-shot, no-join query. Repository code
in `packages/api` maps between the logical types above and these items, so the rest of the
codebase only ever deals in `Page`/`Phrase`/`Share`.

### Capacity & lifecycle

- **Billing mode:** on-demand (pay-per-request) — matches the bursty, scale-to-zero profile
  (North Star: *Fast & Efficient*).
- **TTL (optional, revisable):** shared pages could carry a TTL attribute to auto-expire old
  shares and keep storage lean. Not enabled by default; recorded as a future option.
- **Images** never live in DynamoDB. They go to S3 and are ephemeral — see
  [`03-api-design.md`](./03-api-design.md) and [`07-monorepo-and-deployment.md`](./07-monorepo-and-deployment.md).
