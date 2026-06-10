// S3 presign service. Keeps large image bytes off API Gateway: clients ask for a
// short-lived presigned PUT URL, upload the photo directly to S3 under an
// ephemeral, dated key, then reference that key when they call POST /pages.
//
// On the scan path the API fetches the uploaded bytes back; a missing/expired key
// is surfaced as `image_not_found` (specs/03-api-design.md).

import { GetObjectCommand, PutObjectCommand, type S3Client, NoSuchKey } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { imageNotFound } from '../errors.js';

/** Default upload content type when the client does not specify one. */
export const DEFAULT_CONTENT_TYPE = 'image/jpeg';

/** Presigned-URL lifetime. Short by design — uploads are immediate then ephemeral. */
export const DEFAULT_UPLOAD_EXPIRY_SECONDS = 300;

export interface PresignResult {
  uploadUrl: string;
  imageKey: string;
  expiresInSeconds: number;
}

/** Pluggable presigner so the service is unit-testable without real S3 signing. */
export type Presigner = (
  client: S3Client,
  command: PutObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

export interface S3PresignServiceOptions {
  /** Presigned-URL TTL in seconds. */
  expiresInSeconds?: number;
  /** Override the presigner (tests inject a stub; defaults to AWS getSignedUrl). */
  presigner?: Presigner;
  /** Override the key's date (tests pin it; defaults to now). */
  now?: () => Date;
}

/** `uploads/YYYY/MM/DD/<uuid>.jpg` — dated prefix matches the S3 lifecycle rule. */
function buildImageKey(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `uploads/${yyyy}/${mm}/${dd}/${uuidv4()}.jpg`;
}

export class S3PresignService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly expiresInSeconds: number;
  private readonly presigner: Presigner;
  private readonly now: () => Date;

  constructor(client: S3Client, bucket: string, options: S3PresignServiceOptions = {}) {
    this.client = client;
    this.bucket = bucket;
    this.expiresInSeconds = options.expiresInSeconds ?? DEFAULT_UPLOAD_EXPIRY_SECONDS;
    this.presigner = options.presigner ?? getSignedUrl;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Mint a presigned PUT URL and the dated object key the client will reference.
   * `contentType` defaults to image/jpeg.
   */
  async presignUpload(contentType?: string): Promise<PresignResult> {
    const imageKey = buildImageKey(this.now());
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: imageKey,
      ContentType: contentType ?? DEFAULT_CONTENT_TYPE,
    });
    const uploadUrl = await this.presigner(this.client, command, {
      expiresIn: this.expiresInSeconds,
    });
    return { uploadUrl, imageKey, expiresInSeconds: this.expiresInSeconds };
  }

  /**
   * Fetch the bytes of a previously uploaded object for the scan path. A
   * missing/expired key throws an `image_not_found` ApiError (HTTP 404).
   */
  async getUploadedImage(imageKey: string): Promise<Uint8Array> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: imageKey }),
      );
      if (result.Body === undefined) {
        throw imageNotFound(undefined, { imageKey });
      }
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (isNotFound(error)) {
        throw imageNotFound(undefined, { imageKey });
      }
      throw error;
    }
  }
}

/** Recognise S3's "object does not exist" responses across its error shapes. */
function isNotFound(error: unknown): boolean {
  if (error instanceof NoSuchKey) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: unknown }).name;
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (name === 'NoSuchKey' || name === 'NotFound') {
      return true;
    }
    if (status === 404) {
      return true;
    }
  }
  return false;
}
