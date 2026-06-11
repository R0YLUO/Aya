---
title: Scan flow (end to end)
type: concept
packages: [mobile, api, llm]
tasks: [mobile-scan-flow, api-handler-uploads, api-s3-presign-service, llm-run-ocr, llm-analyze-text, api-handler-pages]
summary: Photo → presign → S3 PUT → POST /pages (OCR + analysis, stateless) → AnalyzedPage saved locally. Full server path + router built; only the infra/deploy remains.
updated: 2026-06-11
---

# Scan flow (as built so far)

```
mobile runScan()                       api                              llm
  ① POST /uploads ───────────► makeUploadsHandler → S3PresignService
  ② PUT bytes ────────────────► (S3 directly, presigned URL)
  ③ POST /pages ──────────────► makeScanHandler (built; wired via
                                   makeScanHandlerWithLlm)
                                   getUploadedImage(imageKey)
                                   → runOcr (built) → analyzeText (built)
                                   → AnalyzedPage (no persistence!)
  savePage() → LocalPageStore
```

- Client-side orchestration (`packages/mobile/src/scan/runScan.ts`) is **done**: it
  reads image bytes exactly once, makes exactly one `POST /pages` call, persists the
  result locally, throws typed `ApiError`s upward.
- Server side, `POST /uploads` and `POST /pages` both exist, and the **router**
  (`api-router`, `api/src/router.ts`) now maps method+path → handler, parses the JSON
  body, and owns the central `toErrorResponse` catch. The remaining gap is the
  `infra-*` SST deploy + the Lambda event ↔ `RouterRequest` adapter.

## Contracts the pages handler must honour (already fixed by built code)

- Request `{ imageKey }` (`ScanRequestSchema`); response is a full `AnalyzedPage`
  (`ScanResponseSchema`) — the mobile client already validates against these.
- OCR statuses map to errors: `unreadable` → `image_unreadable` (422), 
  `no_chinese_text` → `no_chinese_text` (422); missing S3 key → `image_not_found`
  (404, already thrown by `S3PresignService.getUploadedImage`); analysis/reconstruction
  failure → `analysis_failed` (502).
- **Stateless**: nothing is written on this path (golden rule #6). Page/phrase ids
  (uuid v4) and `createdAt` are minted here and only persisted later if shared.
- Exactly two LLM calls (golden rule #4). The analysis result must pass
  [checkReconstruction](./reconstruction-invariant.md) before returning.
- ~15s expected latency lives inside step ③; the mobile UI already treats it as a
  non-blocking loading state.
