import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { GetObjectCommand, S3Client, type PutObjectCommand } from '@aws-sdk/client-s3';
import { ApiError } from '../errors.js';
import {
  DEFAULT_CONTENT_TYPE,
  DEFAULT_UPLOAD_EXPIRY_SECONDS,
  S3PresignService,
  type Presigner,
} from './s3-presign-service.js';

const BUCKET = 'aya-uploads-test';
const s3Mock = mockClient(S3Client);

/** Captures the command/options it was called with and returns a fixed URL. */
function stubPresigner(): Presigner & { calls: Array<{ command: PutObjectCommand; expiresIn: number }> } {
  const calls: Array<{ command: PutObjectCommand; expiresIn: number }> = [];
  const fn = (async (_client, command, options) => {
    calls.push({ command, expiresIn: options.expiresIn });
    return 'https://aya-uploads-test.s3.amazonaws.com/signed?X-Amz-Signature=abc';
  }) as Presigner & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

function service(presigner: Presigner): S3PresignService {
  return new S3PresignService(s3Mock as unknown as S3Client, BUCKET, {
    presigner,
    now: () => new Date('2026-06-08T10:12:00.000Z'),
  });
}

beforeEach(() => {
  s3Mock.reset();
});

test('presignUpload returns a dated key, signed URL, and default expiry', async () => {
  const presigner = stubPresigner();
  const result = await service(presigner).presignUpload();

  assert.match(result.imageKey, /^uploads\/2026\/06\/08\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(result.uploadUrl.startsWith('https://'), true);
  assert.equal(result.expiresInSeconds, DEFAULT_UPLOAD_EXPIRY_SECONDS);
});

test('presignUpload defaults content type to image/jpeg', async () => {
  const presigner = stubPresigner();
  await service(presigner).presignUpload();
  assert.equal(presigner.calls[0]!.command.input.ContentType, DEFAULT_CONTENT_TYPE);
  assert.equal(presigner.calls[0]!.expiresIn, DEFAULT_UPLOAD_EXPIRY_SECONDS);
});

test('presignUpload honours an explicit content type', async () => {
  const presigner = stubPresigner();
  await service(presigner).presignUpload('image/png');
  assert.equal(presigner.calls[0]!.command.input.ContentType, 'image/png');
});

test('getUploadedImage returns the object bytes', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  s3Mock.on(GetObjectCommand).resolves({
    Body: { transformToByteArray: async () => bytes } as never,
  });
  const out = await service(stubPresigner()).getUploadedImage('uploads/2026/06/08/x.jpg');
  assert.deepEqual(out, bytes);
});

test('getUploadedImage maps a NoSuchKey error to image_not_found (404)', async () => {
  const err = Object.assign(new Error('missing'), {
    name: 'NoSuchKey',
    $metadata: { httpStatusCode: 404 },
  });
  s3Mock.on(GetObjectCommand).rejects(err);

  await assert.rejects(
    () => service(stubPresigner()).getUploadedImage('uploads/2026/06/08/missing.jpg'),
    (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, 'image_not_found');
      assert.equal(e.statusCode, 404);
      return true;
    },
  );
});

test('getUploadedImage rethrows non-not-found errors unchanged', async () => {
  const err = Object.assign(new Error('throttled'), {
    name: 'SlowDown',
    $metadata: { httpStatusCode: 503 },
  });
  s3Mock.on(GetObjectCommand).rejects(err);
  await assert.rejects(
    () => service(stubPresigner()).getUploadedImage('uploads/2026/06/08/x.jpg'),
    /throttled/,
  );
});
