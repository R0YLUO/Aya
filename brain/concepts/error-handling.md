---
title: Error handling across the stack
type: concept
packages: [shared, api, web, mobile]
tasks: [shared-api-contracts, api-error-envelope, mobile-scan-flow, mobile-error-states]
summary: One envelope, one closed ErrorCode enum, three deliberately separate ApiError classes, and two codes that intentionally live outside the enum.
updated: 2026-06-10
---

# Error handling (as built)

Wire contract: every failure is `{ error: { code, message, details? } }`
(`ErrorEnvelopeSchema` in `@aya/shared`). `ERROR_CODES` is the **closed set of
expected, client-actionable** failures: `image_unreadable`, `no_chinese_text`,
`image_not_found`, `analysis_failed`, `validation_error`, `share_not_found`.

## Status / copy mapping (server)

`packages/api/src/errors.ts` owns the canonical table: 400 `validation_error`,
404 `image_not_found`/`share_not_found`, 422 `image_unreadable`/`no_chinese_text`,
502 `analysis_failed`. Default messages match PRD copy verbatim
("Photo unclear, please retake."). Throwing `ApiError` (or a convenience constructor
like `imageUnreadable()`) is the canonical failure path; `toErrorResponse` maps
anything else to a 500.

## Codes intentionally OUTSIDE the enum

- `internal_error` (server, 500): "something we didn't anticipate" is not a PRD
  state, so it's excluded from `ErrorCode` — see
  [decision](../decisions/internal-error-outside-enum.md).
- `not_found` (server, 404): the **router's unknown-route** code
  (`NOT_FOUND_CODE` in `api/src/errors.ts`). "No such endpoint" is transport, not a
  PRD client-actionable state — distinct from resource-not-found
  (`image_not_found`/`share_not_found`). A 404 body from a missing route therefore
  won't parse against the closed-enum `ErrorEnvelopeSchema`; check it structurally.
- `network_error` (clients only): mobile synthesises it for transport failures /
  unparseable responses; it exists in `ScanErrorCode = ErrorCode | 'network_error'`,
  never on the wire from the server.

## Three ApiError classes, deliberately not shared

| Class | Package | Carries |
|---|---|---|
| `ApiError` | `api/src/errors.ts` | code + statusCode + details (server-side throwable) |
| `ApiError` | `web/src/lib/api.ts` | code + status (+ `isShareNotFound`) |
| `ApiError` | `mobile/src/api/client.ts` | `ErrorCode \| 'network_error'` + nullable status |

They share a name but have different shapes/needs; clients must depend only on
`@aya/shared`, so a common class would force error *behaviour* into the contract
package. Keep them separate.

## Client behaviour rules

- Clients branch on `code`, never on message strings.
- Mobile UI copy + recovery CTA come exclusively from
  `mobile/src/errors/messages.ts` (retake vs retry per PRD). The inline
  `ScanErrorScreen.tsx` renders that copy and routes its single CTA through
  `recoveryHandler(code, {onRetake, onRetry})` — the one place CTA→handler
  routing lives — so failures surface inline rather than crashing.
- Web: only `share_not_found` renders the friendly not-found state; everything else
  must propagate (an outage is not a 404).
