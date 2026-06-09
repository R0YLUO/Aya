// runScan — the scan submission orchestration (framework-free, unit-tested).
//
// On confirm the app: ① POST /uploads for a presigned URL, ② PUT the image
// bytes to S3, ③ POST /pages exactly once to OCR+analyse the page. The returned
// AnalyzedPage is saved to the local-first store; image bytes are read once for
// the upload and never retained (PRD security constraint).
//
// The ~15s processing happens inside step ③; the UI shows a non-blocking
// loading state around this call (see useScanFlow / ScanningScreen).

import type { AnalyzedPage } from '@aya/shared';
import type { AyaApiClient } from '../api/client.js';
import type { CameraService, CapturedPhoto } from '../camera/types.js';
import type { PageStore } from '../store/types.js';

export interface ScanDeps {
  api: Pick<AyaApiClient, 'requestUpload' | 'uploadImage' | 'scanPage'>;
  store: Pick<PageStore, 'savePage'>;
  camera: Pick<CameraService, 'readBytes'>;
}

/**
 * Upload the confirmed photo and scan it into an AnalyzedPage, persisting the
 * result locally. Throws (an {@link ApiError} from the client) on failure; the
 * caller maps the error code to PRD copy (see ../errors).
 *
 * Makes exactly one POST /pages call.
 */
export async function runScan(
  deps: ScanDeps,
  photo: CapturedPhoto,
): Promise<AnalyzedPage> {
  const { api, store, camera } = deps;

  // ① presign
  const upload = await api.requestUpload(photo.contentType);

  // ② upload bytes to S3 (read once, then discard)
  const bytes = await camera.readBytes(photo);
  await api.uploadImage(upload.uploadUrl, bytes, photo.contentType);

  // ③ scan — the single OCR+analysis round-trip
  const analyzed = await api.scanPage(upload.imageKey);

  // persist locally so the reader is available offline / after reload
  await store.savePage(analyzed);

  return analyzed;
}
