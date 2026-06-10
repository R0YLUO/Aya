// GET /health — liveness. Returns 200 with { status: 'ok', version }, validated
// against the shared HealthResponse contract so the wire shape never drifts
// (specs/03-api-design.md §5).

import { HealthResponseSchema, type HealthResponse } from '@aya/shared';
import type { HandlerResult } from './types.js';

/** Resolve the reported version from env, falling back to a default. */
function resolveVersion(): string {
  return process.env['AYA_VERSION'] ?? '0.1.0';
}

/** Handle GET /health. Takes no input. */
export function healthHandler(): HandlerResult<HealthResponse> {
  const body = HealthResponseSchema.parse({ status: 'ok', version: resolveVersion() });
  return { statusCode: 200, body };
}
