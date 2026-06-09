// Zod schemas for the Aya domain types, paired one-to-one with the interfaces in
// `domain.ts`. The same definition validates API payloads and LLM output so the
// wire contract and the type system never drift (North Star: Reliable).
//
// Source of truth: specs/02-data-model.md.

import { z } from 'zod';
import type { Page, Phrase, Share, AnalyzedPage } from './domain.js';

/** A non-empty ISO 8601 timestamp (e.g. "2026-06-08T10:12:00.000Z"). */
const isoDateTime = z.iso.datetime();

/** Analysis fields are nullable strings: `null` for non-word tokens. */
const nullableString = z.string().nullable();

export const PageSchema = z.object({
  id: z.string(),
  fullText: z.string(),
  createdAt: isoDateTime,
});

export const PhraseSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  index: z.int().positive(),
  original: z.string(),
  pinyin: nullableString,
  translation: nullableString,
  contextualMeaning: nullableString,
});

export const ShareSchema = z.object({
  code: z.string(),
  pageId: z.string(),
  createdAt: isoDateTime,
});

export const AnalyzedPageSchema = z.object({
  page: PageSchema,
  phrases: z.array(PhraseSchema),
});

// Compile-time assertions: each schema's inferred type matches its interface
// exactly (in both directions). A drift between `domain.ts` and these schemas is
// a typecheck failure, not a runtime surprise.
type _PageMatches = [
  z.infer<typeof PageSchema> extends Page ? true : false,
  Page extends z.infer<typeof PageSchema> ? true : false,
];
type _PhraseMatches = [
  z.infer<typeof PhraseSchema> extends Phrase ? true : false,
  Phrase extends z.infer<typeof PhraseSchema> ? true : false,
];
type _ShareMatches = [
  z.infer<typeof ShareSchema> extends Share ? true : false,
  Share extends z.infer<typeof ShareSchema> ? true : false,
];
type _AnalyzedPageMatches = [
  z.infer<typeof AnalyzedPageSchema> extends AnalyzedPage ? true : false,
  AnalyzedPage extends z.infer<typeof AnalyzedPageSchema> ? true : false,
];

const _pageOk = [true, true] satisfies _PageMatches;
const _phraseOk = [true, true] satisfies _PhraseMatches;
const _shareOk = [true, true] satisfies _ShareMatches;
const _analyzedPageOk = [true, true] satisfies _AnalyzedPageMatches;
void _pageOk;
void _phraseOk;
void _shareOk;
void _analyzedPageOk;
