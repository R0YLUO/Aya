# API Design

A single REST API (TypeScript, on Lambda + API Gateway) serves both the mobile app and the web
reader. No authentication or authorization — out of scope by product direction. All requests
and responses are JSON (except the direct S3 image `PUT`), validated with the Zod schemas from
`packages/shared` so the wire contract and the type system never drift (North Star: *Reliable*).

Base URL per environment, e.g. `https://api.aya.app` (prod), `https://api.dev.aya.app` (dev).

## Conventions

- **Content type:** `application/json` unless noted.
- **IDs:** uuid v4 for `Page`/`Phrase`; short base62 code for `Share`.
- **Errors:** a consistent envelope (see [Errors](#errors)) with a machine-readable `code` so
  clients can map to the exact PRD error states.
- **Validation:** every request body is parsed with Zod at the edge; a parse failure is a
  `400 validation_error`.

---

## Endpoints

### 1. `POST /uploads` — get a presigned image upload URL

Returns a short-lived presigned S3 `PUT` URL and the object key the client will reference when
it asks for analysis. Keeps large image bytes off API Gateway entirely.

**Request:** *(optional metadata; body may be empty)*
```jsonc
{ "contentType": "image/jpeg" }   // optional; defaults to image/jpeg
```

**Response `200`:**
```jsonc
{
  "uploadUrl": "https://aya-uploads-dev.s3...&X-Amz-Signature=...",
  "imageKey": "uploads/2026/06/08/9b1c....jpg",
  "expiresInSeconds": 300
}
```

The client then uploads the photo directly:
```
PUT <uploadUrl>
Content-Type: image/jpeg
<binary image>
```
Uploaded objects live under a prefix with an **S3 lifecycle rule that auto-deletes them**
shortly after creation — images are ephemeral (PRD: no client-side storage after submit, no
long-term image retention).

---

### 2. `POST /pages` — scan: OCR → analysis (stateless, no DB write)

The core endpoint. Given an uploaded image key, it runs the **two-call pipeline** server-side
(OCR then analysis) and returns the fully analysed page. **It persists nothing** — the mobile
app stores the result in its local-first store.

**Request:**
```jsonc
{ "imageKey": "uploads/2026/06/08/9b1c....jpg" }
```

**Response `200`:**
```jsonc
{
  "page": {
    "id": "0f2e...uuid",
    "fullText": "他三天打鱼两天晒网，怎么可能学好中文？",
    "createdAt": "2026-06-08T10:12:00.000Z"
  },
  "phrases": [
    { "id": "...", "pageId": "0f2e...", "index": 1, "original": "他",
      "pinyin": "tā", "translation": "he", "contextualMeaning": "the person being described" },
    { "id": "...", "pageId": "0f2e...", "index": 2, "original": "三天打鱼两天晒网",
      "pinyin": "sān tiān dǎ yú liǎng tiān shài wǎng",
      "translation": "to work in fits and starts (idiom)",
      "contextualMeaning": "here: lacking the discipline to study consistently" },
    { "id": "...", "pageId": "0f2e...", "index": 3, "original": "，",
      "pinyin": null, "translation": null, "contextualMeaning": null }
    /* … phrases continue; concatenating `original` by index rebuilds fullText … */
  ]
}
```

**Error responses** map directly to the PRD edge cases:

| Situation | HTTP | `code` | Client action |
|-----------|------|--------|---------------|
| Photo too blurry / OCR below confidence | `422` | `image_unreadable` | "Photo unclear, please retake" |
| No Chinese text detected | `422` | `no_chinese_text` | "No Chinese text found, please try again" |
| Image key missing/expired in S3 | `404` | `image_not_found` | Re-upload |
| LLM/structured-output failure after retries | `502` | `analysis_failed` | Offer retry |
| Bad request body | `400` | `validation_error` | (developer error) |

Processing target: within the ~15s budget (PRD). The client shows a loading state for the whole
call; this endpoint returns once both LLM calls complete. (We chose a single combined endpoint
over a progressive two-call client flow — see [ADR-0004](./08-decisions-log.md).)

---

### 3. `POST /shares` — persist a page and mint a short URL

Called when the user shares a locally-held page to the web reader. The client **uploads the
full `Page` + `Phrase`s** (the backend did not retain them from the scan). The backend persists
them to DynamoDB in one transaction and returns a short code + URL.

**Request:**
```jsonc
{
  "page":    { "id": "0f2e...", "fullText": "…", "createdAt": "2026-06-08T10:12:00.000Z" },
  "phrases": [ { "id": "...", "pageId": "0f2e...", "index": 1, "original": "他", "pinyin": "tā",
                 "translation": "he", "contextualMeaning": "…" } /* … */ ]
}
```

**Response `201`:**
```jsonc
{
  "code": "k7Qm2pX9",
  "url": "https://aya.app/s/k7Qm2pX9",
  "pageId": "0f2e..."
}
```

Validation: `phrases` must all reference `page.id`, `index` values must be unique and contiguous
from 1, and concatenated `original` must equal `page.fullText` (reconstruction invariant). A
violation is `400 validation_error` (North Star: *Reliable* — we don't persist a corrupt page).

---

### 4. `GET /shares/{code}` — resolve a short URL to its analysed page

Used by the web reader. Resolves the code to a `pageId`, loads the page and its phrases (single
DynamoDB partition query), and returns them.

**Response `200`:**
```jsonc
{
  "page":    { "id": "0f2e...", "fullText": "…", "createdAt": "…" },
  "phrases": [ /* ordered by index, same shape as /pages */ ]
}
```

**Error:** unknown/expired code → `404 share_not_found`.

> The public web route is `https://aya.app/s/{code}` (a Next.js page). That page calls
> `GET /shares/{code}` server-side and renders the reader. See
> [`07-monorepo-and-deployment.md`](./07-monorepo-and-deployment.md).

---

### 5. `GET /health` — liveness

```jsonc
{ "status": "ok", "version": "0.1.0" }
```

---

## Errors

Consistent envelope across all endpoints:

```jsonc
{
  "error": {
    "code": "image_unreadable",          // machine-readable, stable
    "message": "Photo unclear, please retake.",  // human-readable, client-displayable
    "details": { }                        // optional, structured context
  }
}
```

| HTTP | Meaning |
|------|---------|
| `400 validation_error` | Request failed Zod validation or an invariant check |
| `404` | Referenced resource (image key, share code) not found |
| `422` | Request was valid but the content can't be processed (unreadable photo, no Chinese) |
| `502 analysis_failed` | Upstream LLM/structured-output failure after retries |
| `500` | Unexpected server error |

## Contract ownership

Request/response Zod schemas live in `packages/shared` and are imported by:
- `packages/api` to validate inbound requests and shape responses,
- `packages/web` and `packages/mobile` to type their API clients.

One definition, three consumers — a change to the contract is a typecheck event everywhere
(North Star: *Extensible*).
