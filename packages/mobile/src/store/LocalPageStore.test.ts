import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReconstruction } from '@aya/shared';
import { LocalPageStore } from './LocalPageStore.js';
import { createInMemoryBackend } from './asyncStorageBackend.js';
import { makeAnalyzedPage, makePage, makePhrase } from '../test-support/fixtures.js';

test('save/load round-trip preserves the reconstruction invariant', async () => {
  const store = new LocalPageStore(createInMemoryBackend());
  const page = makeAnalyzedPage();

  await store.savePage(page);
  const loaded = await store.getPage(page.page.id);

  assert.ok(loaded);
  assert.deepEqual(loaded, page);
  assert.deepEqual(
    checkReconstruction(loaded.page.fullText, loaded.phrases),
    { ok: true },
  );
});

test('a saved page survives an app reload (shared persistent backend)', async () => {
  // The same backing storage shared by two store instances models a reload:
  // the first instance writes; a fresh instance reads after "restart".
  const backing = new Map<string, string>();
  const writer = new LocalPageStore(createInMemoryBackend(backing));
  await writer.savePage(makeAnalyzedPage());

  const reopened = new LocalPageStore(createInMemoryBackend(backing));
  const loaded = await reopened.getPage(makePage().id);
  assert.ok(loaded);
  assert.equal(loaded.page.fullText, makePage().fullText);
});

test('getPage returns null for an unknown id', async () => {
  const store = new LocalPageStore(createInMemoryBackend());
  assert.equal(await store.getPage('missing'), null);
});

test('listPages returns all saved pages, newest first', async () => {
  const store = new LocalPageStore(createInMemoryBackend());
  const older = {
    page: { id: 'id-older', fullText: '一', createdAt: '2026-06-01T00:00:00.000Z' },
    phrases: [makePhrase(1, '一', true, 'id-older')],
  };
  const newer = {
    page: { id: 'id-newer', fullText: '二', createdAt: '2026-06-08T00:00:00.000Z' },
    phrases: [makePhrase(1, '二', true, 'id-newer')],
  };
  await store.savePage(older);
  await store.savePage(newer);

  const pages = await store.listPages();
  assert.equal(pages.length, 2);
  assert.equal(pages[0]!.page.id, 'id-newer');
  assert.equal(pages[1]!.page.id, 'id-older');
});

test('no image bytes are persisted — only the analysed text', async () => {
  const backing = new Map<string, string>();
  const store = new LocalPageStore(createInMemoryBackend(backing));
  await store.savePage(makeAnalyzedPage());

  // Inspect the raw persisted payload: it is exactly the AnalyzedPage shape,
  // with no image/bytes/uri fields.
  const raw = [...backing.values()][0]!;
  const obj = JSON.parse(raw);
  assert.deepEqual(Object.keys(obj).sort(), ['page', 'phrases']);
  assert.ok(!raw.includes('uri'));
  assert.ok(!raw.includes('bytes'));
});

test('deletePage removes a stored page', async () => {
  const store = new LocalPageStore(createInMemoryBackend());
  const page = makeAnalyzedPage();
  await store.savePage(page);
  await store.deletePage(page.page.id);
  assert.equal(await store.getPage(page.page.id), null);
});

test('corrupt stored data is ignored on read', async () => {
  const backing = new Map<string, string>([['aya:page:bad', 'not json']]);
  const store = new LocalPageStore(createInMemoryBackend(backing));
  assert.equal(await store.getPage('bad'), null);
  assert.deepEqual(await store.listPages(), []);
});
