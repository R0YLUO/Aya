---
title: "Decision: internal_error and network_error live outside ErrorCode"
type: decision
packages: [shared, api, mobile]
tasks: [api-error-envelope, mobile-scan-flow]
summary: The shared ErrorCode enum stays the closed set of expected, client-actionable failures; 500s and transport failures use codes outside it.
updated: 2026-06-10
---

# `internal_error` / `network_error` are not ErrorCodes

**Context.** `ERROR_CODES` in `@aya/shared` maps 1:1 to PRD error states that clients
present with specific copy/CTAs. Two real-world failures don't fit: unexpected server
errors (500) and client-side transport failures.

**Decision.**
- Server: `toErrorResponse` returns 500 with literal code `internal_error`
  (`INTERNAL_ERROR_CODE` in `packages/api/src/errors.ts`), deliberately **not** added
  to the enum — the enum means "expected and actionable".
- Mobile: transport failures synthesise `network_error`; the widened type is local
  (`ScanErrorCode = ErrorCode | 'network_error'`), never on the wire.

**Consequences.**
- Adding a new PRD failure state = extend `ERROR_CODES` (ripples through typecheck).
  Adding infrastructure noise ≠ extending the enum.
- Client envelope parsing: a 500's `internal_error` won't parse as an `ErrorCode` —
  mobile's `ErrorEnvelopeSchema.safeParse` fails and it degrades to `network_error`
  (acceptable: both present as "retry"). Web throws a generic `analysis_failed`-coded
  `ApiError`. Keep this in mind before adding codes the schema can't parse.
