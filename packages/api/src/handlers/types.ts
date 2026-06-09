// Transport-agnostic handler contract. Handlers receive a parsed request and
// return a status code + JSON-serialisable body. The future routing layer
// (api-router) adapts API Gateway events to/from these shapes and owns the
// central error catch. Keeping handlers free of API Gateway types makes them
// trivial to unit-test (specs/03-api-design.md).

/** A parsed inbound request handed to a handler by the router. */
export interface HandlerRequest {
  /** Already-parsed JSON body, if any (the router parses and the handler validates). */
  body?: unknown;
  /** Path parameters, e.g. `{ code }` for GET /shares/{code}. */
  pathParameters?: Record<string, string | undefined>;
}

/** A handler's result: an HTTP status and a JSON-serialisable body. */
export interface HandlerResult<T = unknown> {
  statusCode: number;
  body: T;
}

/** A handler maps a parsed request to a result (sync or async). */
export type Handler<T = unknown> = (
  request: HandlerRequest,
) => Promise<HandlerResult<T>> | HandlerResult<T>;
