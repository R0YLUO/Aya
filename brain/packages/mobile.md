---
title: "@aya/mobile"
type: package
packages: [mobile]
tasks: [mobile-package-scaffold, mobile-camera-capture, mobile-scan-flow, mobile-local-store, mobile-reader-view, mobile-error-states, mobile-phrase-popup, mobile-share-flow]
summary: RN app — typed API client, camera/scan state machines, local-first page store, tappable reader view, tap-to-translate phrase popup, inline scan-error UI, share flow (mint short URL → native share/copy). All planned mobile tasks done.
updated: 2026-06-11
---

# @aya/mobile (as built)

React Native app, client-team-owned internals. Depends on `@aya/shared` + HTTP only.
The dominant pattern: **framework-free, unit-tested core logic** (reducers, services,
orchestration) with thin RN screens over it.

## Status

- Done: scaffold, camera capture, scan flow, local store, reader view,
  error states, phrase popup, share flow.
- All planned mobile tasks complete. (App has still never been launched on a
  device — see `brain/handoffs/mobile-device-run.md`.)

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
- `src/errors/` — scan-path error UI (task `mobile-error-states`).
  `messages.ts`: `presentScanError(code) → {message, cta, ctaLabel}` (PRD copy
  verbatim — `image_unreadable`/`no_chinese_text`/`image_not_found` → "Retake";
  `network_error`/`analysis_failed`/`validation_error`/`share_not_found` →
  "Retry"), plus `recoveryHandler(code, {onRetake, onRetry})` which is the one
  place CTA→handler routing lives (never branch on the message string).
  `ScanErrorScreen.tsx` is the thin inline view: renders the message + a single
  CTA button wired through `recoveryHandler`. It consumes the `ScanErrorCode`
  the scan-flow surfaces (`useScanFlow` → `ScanState{status:'error',code}`), so
  failures render inline, never crash. Driven by the same code seam the
  `ApiError.code`/`network_error` synthesis produces.
- `src/reader/` — PRD Story 2 reader. `tokens.ts` is the framework-free core:
  `readerTokens(page)` sorts phrases by `index` (defensively) and tags each as
  `interactive` iff `pinyin !== null`; `reconstructText(page)` joins `original`s to
  reproduce `fullText` (the reconstruction invariant). `ReaderView.tsx` is the thin
  RN screen — one scrollable `<Text>` of nested `<Text>` runs (so line breaks in each
  token's `original` are preserved); interactive runs get a dotted underline
  affordance and call `onPhrasePress(phrase)` (wired by the future phrase popup);
  null-analysis tokens render plain. Only analysed text is rendered, never the image.
  `ReaderView.onPhrasePress(phrase)` is the seam the phrase popup wires to.
- `src/reader/phrasePopup.ts` — PRD Story 3 popup core (framework-free):
  `PhrasePopupState` (`{phrase} | null`); `openPhrasePopup(state, phrase)` opens
  **only** for interactive phrases (no-op for null-analysis tokens, returns the
  prior state unchanged); `closePhrasePopup()` is the single dismissal — all three
  affordances (tap-outside, swipe-down, close button) route through it;
  `phrasePopupContent(phrase)` narrows the nullable analysis to the non-null MVP
  triple `{pinyin, translation, contextualMeaning}` (per ADR-0003 — no character
  breakdown / example sentences), or `null` for a non-analysed token. No network:
  every field comes from the in-memory `AnalyzedPage` (instant tap).
- `src/reader/PhrasePopupSheet.tsx` — thin RN bottom sheet over `phrasePopup.ts`.
  Backdrop `Pressable` (tap-outside) → `onDismiss`; `Animated`+`PanResponder` drag
  past 80px (swipe-down) → `onDismiss`; `✕` close button → `onDismiss`. Renders
  `original`, then pinyin/translation/contextualMeaning. Returns `null` when the
  phrase is null or carries no analysis (guard; the reader only opens it for
  interactive tokens).
- `src/share/` — PRD share action (the system's **only** write path).
  `runShare(deps, stored)`: framework-free, makes **exactly one** `POST /shares`
  via `api.sharePage(stored.page, stored.phrases)` — the request body is the
  stored `AnalyzedPage` split into `{ page, phrases }`, no transformation, so the
  shared page matches what the user reads. `shareState.ts`:
  idle/sharing/success/error reducer (success holds the minted `ShareResponse`
  so the URL is in state for display; error carries `ShareErrorCode =
  ScanErrorCode` for the inline retry). `useShareFlow.ts`: hook wiring `runShare`
  + reducer, mapping unknown errors to `network_error` (mirrors `useScanFlow`).
  `shareSheet.ts`: injectable `ShareSheet` interface (`present` → RN `Share`
  sheet; `copy` → injected clipboard, no-op-safe without a clipboard module) so
  tests/screens never touch native modules — `createNativeShareSheet` is the
  default adapter. `ShareScreen.tsx`: thin view — idle Share button → sharing
  spinner → success (shows URL + Share/Copy actions) → inline error message +
  single Retry CTA (copy from `errors/messages.ts` `presentScanError`; retry
  re-runs `onShare(page)`).
- `src/test-support/fixtures.ts` — shared valid `AnalyzedPage` fixtures for tests.

## Conventions (keep for the remaining mobile tasks)

- New behaviour = pure reducer/service first (node:test-able), screen second.
- All platform dependencies (fetch, camera, storage) are injected interfaces.
- Surface errors as typed codes; UI copy comes only from `errors/messages.ts`.

## Gotchas

- `ScanErrorCode` is defined **twice** (in `scan/scanState.ts` and
  `errors/messages.ts`), identically. A lint-pass candidate for consolidation.
  `share/shareState.ts` deliberately **reuses** the `errors/messages.ts` one
  (`ShareErrorCode = ScanErrorCode`) rather than adding a third copy.
- `tsconfig.test.json` has an explicit `files` allow-list, not a glob. Any module
  that imports a React/React-Native module (`*.tsx` screens, `shareSheet.ts`,
  hooks) is **excluded** from node:test and covered by `typecheck` only — so a
  new `.test.ts` must not (transitively) import RN, and any new framework-free
  source + its test must be **added to that list** or it won't run. `shareSheet.ts`
  (imports `react-native` `Share`) is therefore typecheck-only; its copy/present
  behaviour is verified through the injectable interface, not a node test.
