// Public barrel for @aya/api.
//
// The API package owns the HTTP edge: Lambda handlers, the routing layer, the
// DynamoDB single-table repository, the S3 presign service, the short-URL
// service, and the shared error-envelope helper. Symbols are re-exported here as
// they land — see specs/03-api-design.md, specs/02-data-model.md, and
// specs/05-observability.md.
//
// Dependency direction (CLAUDE.md): @aya/shared <- @aya/llm <- @aya/api. This
// package depends only on @aya/shared (and, once the scan handler lands, @aya/llm)
// — never the other way around.

export {};
