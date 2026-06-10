---
title: "@aya/mobile"
type: package
packages: [mobile]
tasks: [mobile-package-scaffold, mobile-camera-capture, mobile-scan-flow, mobile-local-store]
summary: RN app — typed API client, camera/scan state machines, local-first page store. Reader view in progress; error-states, phrase popup, share flow todo.
updated: 2026-06-10
---

# @aya/mobile (as built)

React Native app, client-team-owned internals. Depends on `@aya/shared` + HTTP only.
The dominant pattern: **framework-free, unit-tested core logic** (reducers, services,
orchestration) with thin RN screens over it.

## Status

- Done: scaffold, camera capture, scan flow, local store.
- In progress: `mobile-reader-view` (claimed in the plan — check before touching
  reader files). Todo: `mobile-error-states`, `mobile-phrase-popup`,
  `mobile-share-flow`.

## What lives where

- `src/api/client.ts` — `AyaApiClient` (`requestUpload`, `uploadImage` (PUT to the
  presigned URL), `scanPage`, `sharePage`). Every response Zod-validated; error
  envelopes → mobile `ApiError` whose code is `ErrorCode | 'network_error'`
  (transport failures synthesise `network_error`). Injectable `FetchLike` for tests.
- `src/camera/` — `types.ts`: `CapturedPhoto` (file URI + contentType),
  `captureReducer` (camera → preview → confirmed; invalid transitions are no-ops),
  `CameraService` interface (capture/readBytes) so no native module in tests;
  `CameraCaptureScreen.tsx` is the thin view.
- `src/scan/` — `runScan(deps, photo)`: presign → read bytes once & PUT → **exactly
  one** `POST /pages` → save result to local store. Image bytes are never retained
  (PRD security constraint). `scanState.ts`: idle/scanning/success/error reducer;
  `useScanFlow.ts`: React hook wiring `runScan` + reducer, mapping unknown errors to
  `network_error`; `ScanningScreen.tsx`: non-blocking loading UI.
- `src/store/` — `LocalPageStore` over an injectable `StorageBackend`
  (`asyncStorageBackend.ts` adapts AsyncStorage). Keys `aya:page:<pageId>`; validates
  with `AnalyzedPageSchema` on **both** write and read; corrupt entries decode to
  `null` and are skipped; `listPages()` sorts most-recent-first. Only analysed text is
  stored, never images.
- `src/errors/messages.ts` — `ScanErrorCode → {message, cta, ctaLabel}` with PRD copy
  verbatim (`image_unreadable`/`no_chinese_text` → "Retake"; `network_error`/
  `analysis_failed` → "Retry"). Task `mobile-error-states` builds the UI over this.
- `src/test-support/fixtures.ts` — shared valid `AnalyzedPage` fixtures for tests.

## Conventions (keep for the remaining mobile tasks)

- New behaviour = pure reducer/service first (node:test-able), screen second.
- All platform dependencies (fetch, camera, storage) are injected interfaces.
- Surface errors as typed codes; UI copy comes only from `errors/messages.ts`.

## Gotchas

- `ScanErrorCode` is defined **twice** (in `scan/scanState.ts` and
  `errors/messages.ts`), identically. A lint-pass candidate for consolidation.
