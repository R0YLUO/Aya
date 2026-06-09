// POST /uploads — mint a presigned image upload URL. Validates the optional body
// with the shared UploadRequest schema, calls the S3 presign service, and returns
// an UploadResponse. An absent/empty body defaults contentType to image/jpeg; a
// malformed body is a 400 validation_error (specs/03-api-design.md §1).

import { UploadRequestSchema, type UploadResponse } from '@aya/shared';
import { validationError } from '../errors.js';
import type { S3PresignService } from '../services/s3-presign-service.js';
import type { Handler, HandlerRequest, HandlerResult } from './types.js';

/**
 * Build the POST /uploads handler bound to a presign service. The service is
 * injected so the table/bucket config stays at the edge and the handler is
 * unit-testable with a stub.
 */
export function makeUploadsHandler(presign: S3PresignService): Handler<UploadResponse> {
  return async (request: HandlerRequest): Promise<HandlerResult<UploadResponse>> => {
    // An empty/absent body is valid: default to {}. Anything present must parse.
    const raw = request.body ?? {};
    const parsed = UploadRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw validationError('Invalid upload request body.', {
        issues: parsed.error.issues,
      });
    }

    const result = await presign.presignUpload(parsed.data.contentType);
    return { statusCode: 200, body: result };
  };
}
