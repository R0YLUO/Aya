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

export {
  ApiError,
  INTERNAL_ERROR_CODE,
  toErrorResponse,
  validationError,
  imageNotFound,
  shareNotFound,
  imageUnreadable,
  noChineseText,
  analysisFailed,
} from './errors.js';
export type { ErrorDetails, ErrorResponse } from './errors.js';

export { PageRepository } from './repositories/page-repository.js';

export {
  S3PresignService,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_UPLOAD_EXPIRY_SECONDS,
} from './services/s3-presign-service.js';
export type {
  PresignResult,
  Presigner,
  S3PresignServiceOptions,
} from './services/s3-presign-service.js';

export {
  ShortUrlService,
  generateShareCode,
  SHARE_CODE_LENGTH,
} from './services/short-url-service.js';
