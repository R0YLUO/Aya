import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { checkReconstruction, type Page, type Phrase, type Share } from '@aya/shared';
import { PageRepository } from './page-repository.js';
import { phraseSk, toPageItem, toPhraseItem } from './keys.js';

const TABLE = 'aya-test';
const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

const ddbMock = mockClient(DynamoDBDocumentClient);

function makePage(fullText: string): Page {
  return { id: PAGE_ID, fullText, createdAt: '2026-06-08T10:12:00.000Z' };
}

function makePhrases(originals: string[]): Phrase[] {
  return originals.map((original, i) => ({
    id: `phrase-${i + 1}`,
    pageId: PAGE_ID,
    index: i + 1,
    original,
    pinyin: original.trim() === '' ? null : `py-${i + 1}`,
    translation: original.trim() === '' ? null : `tr-${i + 1}`,
    contextualMeaning: original.trim() === '' ? null : `cm-${i + 1}`,
  }));
}

function repo(): PageRepository {
  return new PageRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE);
}

beforeEach(() => {
  ddbMock.reset();
});

test('savePageWithPhrasesAndShare writes Page META + N phrases + Share in one transaction', async () => {
  ddbMock.on(TransactWriteCommand).resolves({});
  const page = makePage('他好');
  const phrases = makePhrases(['他', '好']);
  const share: Share = { code: 'k7Qm2pX9', pageId: PAGE_ID, createdAt: page.createdAt };

  await repo().savePageWithPhrasesAndShare(page, phrases, share);

  const calls = ddbMock.commandCalls(TransactWriteCommand);
  assert.equal(calls.length, 1);
  const transactItems = calls[0]!.args[0].input.TransactItems!;
  // 1 page + 2 phrases + 1 share.
  assert.equal(transactItems.length, 4);

  const items = transactItems.map((t) => t.Put!.Item!);
  const types = items.map((i) => i['entityType']);
  assert.deepEqual(types, ['Page', 'Phrase', 'Phrase', 'Share']);

  // Page META item.
  assert.equal(items[0]!['PK'], `PAGE#${PAGE_ID}`);
  assert.equal(items[0]!['SK'], 'META');
  // Share item.
  assert.equal(items[3]!['PK'], 'SHARE#k7Qm2pX9');
  assert.equal(items[3]!['SK'], 'META');
  // Every Put targets the configured table.
  for (const t of transactItems) {
    assert.equal(t.Put!.TableName, TABLE);
  }
});

test('phrase sort keys are zero-padded so lexicographic order equals numeric order for >9 phrases', () => {
  // 12 phrases: the lexicographic sort of the sort keys must match numeric order.
  const sks = Array.from({ length: 12 }, (_, i) => phraseSk(i + 1));
  const lexSorted = [...sks].sort();
  assert.deepEqual(lexSorted, sks);
  assert.equal(phraseSk(1), 'PHRASE#000001');
  assert.equal(phraseSk(10), 'PHRASE#000010');
  // Naive (unpadded) keys would sort 10 before 2 — confirm padding fixes that.
  assert.ok('PHRASE#000002' < 'PHRASE#000010');
});

test('getPageWithPhrases returns phrases sorted by ascending index and preserves reconstruction', async () => {
  const fullText = '他三天打鱼，好';
  const page = makePage(fullText);
  const phrases = makePhrases(['他', '三天打鱼', '，', '好']);

  // Return items deliberately out of order to prove the repo sorts them.
  const phraseItems = [...phrases].reverse().map(toPhraseItem);
  ddbMock.on(QueryCommand).resolves({ Items: [toPageItem(page), ...phraseItems] });

  const result = await repo().getPageWithPhrases(PAGE_ID);
  assert.ok(result);
  assert.deepEqual(
    result.phrases.map((p) => p.index),
    [1, 2, 3, 4],
  );
  // Round-trip preserves the reconstruction invariant.
  const check = checkReconstruction(result.page.fullText, result.phrases);
  assert.equal(check.ok, true);

  const calls = ddbMock.commandCalls(QueryCommand);
  assert.equal(calls[0]!.args[0].input.ExpressionAttributeValues![':pk'], `PAGE#${PAGE_ID}`);
});

test('getPageWithPhrases returns undefined when the page META item is absent', async () => {
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  const result = await repo().getPageWithPhrases('missing');
  assert.equal(result, undefined);
});

test('resolveShare returns the AnalyzedPage for a known code', async () => {
  const fullText = '他好';
  const page = makePage(fullText);
  const phrases = makePhrases(['他', '好']);

  ddbMock.on(GetCommand).resolves({
    Item: { PK: 'SHARE#k7Qm2pX9', SK: 'META', entityType: 'Share', code: 'k7Qm2pX9', pageId: PAGE_ID, createdAt: page.createdAt },
  });
  ddbMock.on(QueryCommand).resolves({ Items: [toPageItem(page), ...phrases.map(toPhraseItem)] });

  const result = await repo().resolveShare('k7Qm2pX9');
  assert.ok(result);
  assert.equal(result.page.id, PAGE_ID);
  assert.equal(checkReconstruction(result.page.fullText, result.phrases).ok, true);
});

test('resolveShare returns undefined for an unknown code', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });
  const result = await repo().resolveShare('nope0000');
  assert.equal(result, undefined);
  // No page query is attempted for an unknown share.
  assert.equal(ddbMock.commandCalls(QueryCommand).length, 0);
});
