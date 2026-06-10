import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReconstruction, type AnalyzedPage, type UploadResponse } from '@aya/shared';
import { runScan, type ScanDeps } from './runScan.js';
import { scanReducer, initialScanState } from './scanState.js';
import { makeAnalyzedPage, type CapturedPhoto } from '../test-support/index.js';

interface Counts {
  requestUpload: number;
  uploadImage: number;
  scanPage: number;
  savePage: number;
  readBytes: number;
}

function makeDeps(analyzed: AnalyzedPage): { deps: ScanDeps; counts: Counts; saved: AnalyzedPage[] } {
  const counts: Counts = {
    requestUpload: 0,
    uploadImage: 0,
    scanPage: 0,
    savePage: 0,
    readBytes: 0,
  };
  const saved: AnalyzedPage[] = [];
  const upload: UploadResponse = {
    uploadUrl: 'https://s3.test/put',
    imageKey: 'uploads/2026/06/09/abc.jpg',
    expiresInSeconds: 300,
  };
  const deps: ScanDeps = {
    api: {
      requestUpload: async () => {
        counts.requestUpload++;
        return upload;
      },
      uploadImage: async () => {
        counts.uploadImage++;
      },
      scanPage: async (imageKey) => {
        counts.scanPage++;
        assert.equal(imageKey, upload.imageKey);
        return analyzed;
      },
    },
    store: {
      savePage: async (p) => {
        counts.savePage++;
        saved.push(p);
      },
    },
    camera: {
      readBytes: async () => {
        counts.readBytes++;
        return new Uint8Array([1, 2, 3]);
      },
    },
  };
  return { deps, counts, saved };
}

const photo: CapturedPhoto = { uri: 'file:///tmp/p.jpg', contentType: 'image/jpeg' };

test('happy path: upload -> scan -> save, returns the AnalyzedPage', async () => {
  const analyzed = makeAnalyzedPage();
  const { deps, saved } = makeDeps(analyzed);

  const result = await runScan(deps, photo);

  assert.deepEqual(result, analyzed);
  assert.deepEqual(saved, [analyzed]);
  assert.deepEqual(checkReconstruction(result.page.fullText, result.phrases), {
    ok: true,
  });
});

test('makes exactly one POST /pages call', async () => {
  const { deps, counts } = makeDeps(makeAnalyzedPage());
  await runScan(deps, photo);
  assert.equal(counts.scanPage, 1);
  assert.equal(counts.requestUpload, 1);
  assert.equal(counts.uploadImage, 1);
  assert.equal(counts.savePage, 1);
});

test('does not scan or save when upload fails', async () => {
  const { deps, counts } = makeDeps(makeAnalyzedPage());
  deps.api.requestUpload = async () => {
    throw new Error('presign failed');
  };
  await assert.rejects(() => runScan(deps, photo));
  assert.equal(counts.scanPage, 0);
  assert.equal(counts.savePage, 0);
});

test('scanReducer: start -> scanning, succeeded -> success', () => {
  const scanning = scanReducer(initialScanState, { type: 'start' });
  assert.equal(scanning.status, 'scanning');
  const page = makeAnalyzedPage();
  const success = scanReducer(scanning, { type: 'succeeded', page });
  assert.equal(success.status, 'success');
  assert.deepEqual(success.status === 'success' ? success.page : null, page);
});

test('scanReducer: failed carries the error code', () => {
  const failed = scanReducer(
    { status: 'scanning' },
    { type: 'failed', code: 'image_unreadable', message: 'Photo unclear' },
  );
  assert.equal(failed.status, 'error');
  assert.equal(failed.status === 'error' ? failed.code : null, 'image_unreadable');
});
