import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UploadResponseSchema } from '@aya/shared';
import { ApiError } from '../errors.js';
import { S3PresignService } from '../services/s3-presign-service.js';
import { makeUploadsHandler } from './uploads.js';

/** A presign service whose signer records the requested content type. */
function presignService(): {
  svc: S3PresignService;
  contentTypes: Array<string | undefined>;
} {
  const contentTypes: Array<string | undefined> = [];
  const svc = new S3PresignService(undefined as never, 'aya-uploads-test', {
    now: () => new Date('2026-06-08T10:12:00.000Z'),
    presigner: async (_client, command) => {
      contentTypes.push(command.input.ContentType);
      return 'https://aya-uploads-test.s3.amazonaws.com/signed?X-Amz-Signature=abc';
    },
  });
  return { svc, contentTypes };
}

test('returns 200 with a valid UploadResponse and defaults contentType to image/jpeg for an empty body', async () => {
  const { svc, contentTypes } = presignService();
  const handler = makeUploadsHandler(svc);

  const res = await handler({});
  assert.equal(res.statusCode, 200);
  assert.equal(UploadResponseSchema.safeParse(res.body).success, true);
  assert.match(res.body.imageKey, /^uploads\/2026\/06\/08\/.+\.jpg$/);
  assert.equal(contentTypes[0], 'image/jpeg');
});

test('honours an explicit contentType from the body', async () => {
  const { svc, contentTypes } = presignService();
  const handler = makeUploadsHandler(svc);

  const res = await handler({ body: { contentType: 'image/png' } });
  assert.equal(res.statusCode, 200);
  assert.equal(contentTypes[0], 'image/png');
});

test('a malformed body throws validation_error (400)', async () => {
  const { svc } = presignService();
  const handler = makeUploadsHandler(svc);

  await assert.rejects(
    () => Promise.resolve(handler({ body: { contentType: 123 } })),
    (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, 'validation_error');
      assert.equal(e.statusCode, 400);
      return true;
    },
  );
});
