// Routing layer: maps an HTTP method + path to the matching handler, parses the
// JSON body, and wraps every dispatch in the central error catch that emits the
// standard error envelope. This is the transport-agnostic core of the HTTP edge —
// the Lambda/API Gateway adapter (an infra-* task) converts an APIGatewayProxy
// event into a RouterRequest and the RouterResponse back into a proxy result.
//
// Routes are declared to match specs/03-api-design.md exactly:
//   POST /uploads          GET  /health
//   POST /pages            GET  /shares/{code}
//   POST /shares
//
// An unknown method+path is a 404. A malformed JSON body is a 400 validation_error.
// Any value a handler throws is funneled through toErrorResponse: an ApiError keeps
// its code/status; anything else becomes a generic 500 (specs/03-api-design.md).

import { NOT_FOUND_CODE, toErrorResponse, validationError } from './errors.js';
import type { Handler, HandlerRequest, HandlerResult } from './handlers/types.js';

/** A raw inbound request the router knows how to dispatch (transport-agnostic). */
export interface RouterRequest {
  /** HTTP method, case-insensitive (normalised internally). */
  method: string;
  /** Request path WITHOUT query string, e.g. `/shares/k7Qm2pX9`. */
  path: string;
  /**
   * Raw, unparsed request body. The router parses JSON; handlers validate the
   * resulting shape with the shared Zod schemas. `undefined`/empty means no body.
   */
  rawBody?: string | undefined;
}

/** The router's result: an HTTP status and a JSON-serialisable body. */
export interface RouterResponse<T = unknown> {
  statusCode: number;
  body: T;
}

/** The bundle of constructed handlers the router dispatches to. */
export interface RouterHandlers {
  health: Handler;
  uploads: Handler;
  scan: Handler;
  sharesCreate: Handler;
  sharesResolve: Handler;
}

/** A compiled route: method, a path matcher, and the handler to invoke. */
interface Route {
  method: 'GET' | 'POST';
  /**
   * Match a normalised path. Returns the extracted path parameters (possibly
   * empty) on a match, or `undefined` on no match.
   */
  match(path: string): Record<string, string> | undefined;
  handler: Handler;
}

/** Exact-path matcher (no path parameters). */
function exact(expected: string): Route['match'] {
  return (path) => (path === expected ? {} : undefined);
}

/**
 * Single-segment path-parameter matcher, e.g. `/shares/{code}`. Matches a path
 * with exactly one extra non-empty segment after the prefix and binds it to the
 * given parameter name. Avoids a regex dependency and keeps matching explicit.
 */
function oneParam(prefix: string, name: string): Route['match'] {
  return (path) => {
    if (!path.startsWith(`${prefix}/`)) return undefined;
    const rest = path.slice(prefix.length + 1);
    // Exactly one segment, non-empty, no nested path.
    if (rest === '' || rest.includes('/')) return undefined;
    return { [name]: rest };
  };
}

/**
 * Normalise a path for matching: strip a trailing slash (except root) so
 * `/health` and `/health/` resolve to the same route. The empty path normalises
 * to `/`.
 */
function normalisePath(path: string): string {
  if (path === '' || path === '/') return '/';
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Parse a raw body string as JSON, or throw a 400 validation_error. */
function parseBody(rawBody: string | undefined): unknown {
  if (rawBody === undefined || rawBody.trim() === '') return undefined;
  try {
    return JSON.parse(rawBody);
  } catch {
    throw validationError('Request body is not valid JSON.');
  }
}

/**
 * Build the router from a bundle of constructed handlers. Handlers are injected
 * (built at the edge with their services) so the router stays config-free and
 * fully unit-testable. The returned function dispatches a RouterRequest and never
 * throws — every failure path is converted to a RouterResponse via toErrorResponse.
 */
export function makeRouter(handlers: RouterHandlers): (
  request: RouterRequest,
) => Promise<RouterResponse> {
  const routes: Route[] = [
    { method: 'POST', match: exact('/uploads'), handler: handlers.uploads },
    { method: 'POST', match: exact('/pages'), handler: handlers.scan },
    { method: 'POST', match: exact('/shares'), handler: handlers.sharesCreate },
    { method: 'GET', match: oneParam('/shares', 'code'), handler: handlers.sharesResolve },
    { method: 'GET', match: exact('/health'), handler: handlers.health },
  ];

  return async (request: RouterRequest): Promise<RouterResponse> => {
    try {
      const method = request.method.toUpperCase();
      const path = normalisePath(request.path);

      let pathParameters: Record<string, string> | undefined;
      const route = routes.find((r) => {
        if (r.method !== method) return false;
        const params = r.match(path);
        if (params === undefined) return false;
        pathParameters = params;
        return true;
      });

      if (route === undefined) {
        // Unknown method+path → 404 in the standard envelope.
        return notFound(method, path);
      }

      // Only methods with a body (POST) carry one; GETs ignore rawBody.
      const body = method === 'POST' ? parseBody(request.rawBody) : undefined;

      const handlerRequest: HandlerRequest = {
        body,
        ...(pathParameters !== undefined ? { pathParameters } : {}),
      };

      const result: HandlerResult = await route.handler(handlerRequest);
      return { statusCode: result.statusCode, body: result.body };
    } catch (error) {
      const { statusCode, body } = toErrorResponse(error);
      return { statusCode, body };
    }
  };
}

/** Standard 404 for an unmatched route (not an expected ErrorCode → bespoke envelope). */
function notFound(method: string, path: string): RouterResponse {
  return {
    statusCode: 404,
    body: {
      error: {
        code: NOT_FOUND_CODE,
        message: `No route for ${method} ${path}.`,
      },
    },
  };
}
