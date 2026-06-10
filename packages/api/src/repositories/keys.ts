// Single-table key helpers and item shapes for the Aya DynamoDB table.
//
// One table (`aya-<stage>`) stores three entity types under composite keys:
//   Page   -> PK PAGE#<pageId>   SK META
//   Phrase -> PK PAGE#<pageId>   SK PHRASE#<index padded>
//   Share  -> PK SHARE#<code>    SK META
//
// `index padded` is the integer left-padded to a fixed width so DynamoDB's
// lexicographic sort-key ordering matches numeric order (e.g. PHRASE#000001).
// A page is one META item plus N phrase items under the SAME partition key, so
// "fetch a page and all its phrases in order" is a single partition query.
//
// Source of truth: specs/02-data-model.md.

import type { Page, Phrase, Share } from '@aya/shared';

/** Fixed width for the zero-padded phrase index in the sort key. */
export const PHRASE_INDEX_WIDTH = 6;

export const pagePk = (pageId: string): string => `PAGE#${pageId}`;
export const sharePk = (code: string): string => `SHARE#${code}`;
export const META_SK = 'META' as const;

/** `PHRASE#000001` — zero-padded so lexicographic order equals numeric order. */
export function phraseSk(index: number): string {
  return `PHRASE#${String(index).padStart(PHRASE_INDEX_WIDTH, '0')}`;
}

/** Discriminator stored on every item so a partition scan can route by type. */
export type EntityType = 'Page' | 'Phrase' | 'Share';

export interface PageItem {
  PK: string;
  SK: typeof META_SK;
  entityType: 'Page';
  id: string;
  fullText: string;
  createdAt: string;
}

export interface PhraseItem {
  PK: string;
  SK: string;
  entityType: 'Phrase';
  id: string;
  pageId: string;
  index: number;
  original: string;
  pinyin: string | null;
  translation: string | null;
  contextualMeaning: string | null;
}

export interface ShareItem {
  PK: string;
  SK: typeof META_SK;
  entityType: 'Share';
  code: string;
  pageId: string;
  createdAt: string;
}

// --- domain -> item -------------------------------------------------------

export function toPageItem(page: Page): PageItem {
  return {
    PK: pagePk(page.id),
    SK: META_SK,
    entityType: 'Page',
    id: page.id,
    fullText: page.fullText,
    createdAt: page.createdAt,
  };
}

export function toPhraseItem(phrase: Phrase): PhraseItem {
  return {
    PK: pagePk(phrase.pageId),
    SK: phraseSk(phrase.index),
    entityType: 'Phrase',
    id: phrase.id,
    pageId: phrase.pageId,
    index: phrase.index,
    original: phrase.original,
    pinyin: phrase.pinyin,
    translation: phrase.translation,
    contextualMeaning: phrase.contextualMeaning,
  };
}

export function toShareItem(share: Share): ShareItem {
  return {
    PK: sharePk(share.code),
    SK: META_SK,
    entityType: 'Share',
    code: share.code,
    pageId: share.pageId,
    createdAt: share.createdAt,
  };
}

// --- item -> domain -------------------------------------------------------

export function fromPageItem(item: PageItem): Page {
  return { id: item.id, fullText: item.fullText, createdAt: item.createdAt };
}

export function fromPhraseItem(item: PhraseItem): Phrase {
  return {
    id: item.id,
    pageId: item.pageId,
    index: item.index,
    original: item.original,
    pinyin: item.pinyin,
    translation: item.translation,
    contextualMeaning: item.contextualMeaning,
  };
}

export function fromShareItem(item: ShareItem): Share {
  return { code: item.code, pageId: item.pageId, createdAt: item.createdAt };
}
