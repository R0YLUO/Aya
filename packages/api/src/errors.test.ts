import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorEnvelopeSchema } from '@aya/shared';
import {
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

// Each PRD failure must map to the correct HTTP status and code, with
// client-displayable copy matching the API doc where specified.
const cases: Array<{
  name: string;
  build: () => ApiError;
  status: number;
  code: string;
  message?: string;
}> = [
  {
    name: 'validation_error -> 400',
    build: () => validationError(),
    status: 400,
    code: 'validation_error',
  },
  {
    name: 'image_not_found -> 404',
    build: () => imageNotFound(),
    status: 404,
    code: 'image_not_found',
  },
  {
    name: 'share_not_found -> 404',
    build: () => shareNotFound(),
    status: 404,
    code: 'share_not_found',
  },
  {
    name: 'image_unreadable -> 422 with PRD copy',
    build: () => imageUnreadable(),
    status: 422,
    code: 'image_unreadable',
    message: 'Photo unclear, please retake.',
  },
  {
    name: 'no_chinese_text -> 422 with PRD copy',
    build: () => noChineseText(),
    status: 422,
    code: 'no_chinese_text',
    message: 'No Chinese text found, please try again.',
  },
  {
    name: 'analysis_failed -> 502',
    build: () => analysisFailed(),
    status: 502,
    code: 'analysis_failed',
  },
];

for (const c of cases) {
  test(c.name, () => {
    const res = toErrorResponse(c.build());
    assert.equal(res.statusCode, c.status);
    assert.equal(res.body.error.code, c.code);
    if (c.message !== undefined) {
      assert.equal(res.body.error.message, c.message);
    }
    // Every PRD-code envelope validates against the shared contract.
    assert.equal(ErrorEnvelopeSchema.safeParse(res.body).success, true);
  });
}

test('details are passed through into the envelope', () => {
  const res = toErrorResponse(validationError('bad index', { index: -1 }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.error.details, { index: -1 });
});

test('an unknown (non-ApiError) error maps to 500 internal_error', () => {
  const res = toErrorResponse(new Error('boom'));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, INTERNAL_ERROR_CODE);
  // The internal-error code is intentionally NOT a PRD ErrorCode.
  assert.equal(ErrorEnvelopeSchema.safeParse(res.body).success, false);
});

test('a thrown non-Error value still maps to 500', () => {
  const res = toErrorResponse('a string was thrown');
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, INTERNAL_ERROR_CODE);
});

test('ApiError default message is used when none supplied', () => {
  assert.equal(new ApiError('image_unreadable').message, 'Photo unclear, please retake.');
});
