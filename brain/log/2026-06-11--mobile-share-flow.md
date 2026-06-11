---
title: "mobile-share-flow: share a stored page → mint short URL → native share/copy"
type: log
packages: [mobile]
tasks: [mobile-share-flow]
summary: Built the mobile share action over the existing AyaApiClient.sharePage — framework-free runShare/reducer/hook + injectable ShareSheet + thin ShareScreen, with a mocked-client test asserting the request body equals the stored AnalyzedPage and the URL is surfaced. The last planned mobile task.
updated: 2026-06-11
---

# mobile-share-flow

## What I built

`packages/mobile/src/share/`:
- `runShare(deps, stored)` — framework-free orchestration: one
  `api.sharePage(stored.page, stored.phrases)` call (the system's only write
  path). No transformation, so the shared page == the read page.
- `shareState.ts` — idle/sharing/success/error reducer. Success holds the minted
  `ShareResponse` (URL in state for display); error carries
  `ShareErrorCode = ScanErrorCode` (reuses the existing error-code seam, no third
  copy).
- `useShareFlow.ts` — hook wiring `runShare` + reducer, unknown errors →
  `network_error` (mirrors `useScanFlow`).
- `shareSheet.ts` — injectable `ShareSheet` (`present` → RN `Share`; `copy` →
  injected clipboard, no-op-safe). Default `createNativeShareSheet`. Keeps native
  modules out of tests.
- `ShareScreen.tsx` — thin view: Share → spinner → success (URL + Share/Copy) →
  inline error + single Retry CTA (copy from `errors/messages.ts`).
- Barrel `share/index.ts`; re-exported from `src/index.tsx`.

## Verification

`npm run test -w @aya/mobile` → 57 pass (9 new). Key test: end-to-end through the
real `AyaApiClient` with a mocked `fetch` asserts the serialized `POST /shares`
body equals `{ page, phrases }` of the stored `AnalyzedPage`, the URL is `/shares`
+ POST, and the returned short URL is surfaced; plus the reducer holds the URL in
state for display, and a 400 envelope surfaces `validation_error`.
`npm run typecheck && npm run lint && npm run build` all green.

**Level: mocked only.** No real `POST /shares` round-trip and no device run —
folded into the existing `mobile-device-run` handoff (added this taskId + a share
verify step). Real share also needs the deployed API (`aws-account` handoff).

## Decisions / gotchas

- `tsconfig.test.json` is an explicit `files` allow-list. `shareSheet.ts` imports
  `react-native`, so it's typecheck-only (not node-tested); `runShare.ts` +
  `shareState.ts` + their test were added to the list. The share-sheet
  copy/present behaviour is verified via the injectable interface, not a node
  test. Recorded in the mobile package gotchas.
- This completes every planned `mobile-*` task.
