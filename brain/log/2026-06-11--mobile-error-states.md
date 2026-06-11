---
title: "mobile-error-states: inline scan-error UI"
type: log
packages: [mobile]
tasks: [mobile-error-states]
summary: Built the inline scan-path error UI over the existing code→copy mapping — ScanErrorScreen + a single-source recoveryHandler routing CTA to retake vs retry, with a mocked-client test asserting every code's message + CTA.
updated: 2026-06-11
---

# mobile-error-states

## What I built

The code→copy mapping (`errors/messages.ts`, `presentScanError`) already
existed from `mobile-scan-flow`. This task added the **UI** over it so scan
failures surface inline (PRD: "All errors shown inline with a clear CTA to
retry or retake").

- `errors/messages.ts` — added `recoveryHandler(code, {onRetake, onRetry})`:
  the single place that routes a code's CTA to the right handler
  (`retake` → camera, `retry` → re-run upload+scan). The screen and any other
  UI use it so routing never duplicates `cta === 'retake'`.
- `errors/ScanErrorScreen.tsx` — thin RN view: renders `presentScanError`'s
  message + one CTA button wired through `recoveryHandler`. Consumes the
  `ScanErrorCode` the scan flow surfaces (`useScanFlow` →
  `ScanState{status:'error',code}`), so an error renders inline, never crashes.
- `errors/index.ts` barrel + exports added to `src/index.tsx`.
- `errors/messages.test.ts` (10 tests) — drives a **mocked client** that
  rejects each scan attempt with an `ApiError(code)`, runs the code through the
  same `toErrorCode` seam `useScanFlow` uses, and asserts each of the 7 codes
  maps to the PRD message + CTA, plus that `recoveryHandler` routes
  retake/retry to the right callback, plus an exhaustive no-crash check.
- `tsconfig.test.json` — the test config uses an explicit `files` list (not a
  glob), so the new test file had to be added there or it silently won't run.

## Verification

`npm run typecheck`, `lint`, `build` all green; mobile `npm run test` = 41/41
(10 new). All framework-free / mocked — the `.tsx` screen has never rendered on
a device. Recorded under the existing `mobile-device-run` handoff (added this
taskId + a check to walk each error code on-device).

## Gotcha confirmed

`ScanErrorCode` is still defined twice (`scan/scanState.ts` and
`errors/messages.ts`), identically — a future lint-pass consolidation.
