// Analysis (call ②) structured-output schema and prompt.
//
// One call does segmentation + language analysis + translation together, with
// the full passage in context. LangChain binds this Zod schema so the model
// returns validated JSON, never prose we have to parse (North Star: Reliable;
// specs/04-llm-pipeline.md).
//
// The tokens, concatenated in order, must reproduce the input fullText exactly
// — enforced downstream by the shared reconstruction check.

import { z } from 'zod';

/**
 * One analysed token. `analysis` fields are present for word tokens and `null`
 * for punctuation / whitespace tokens (which are non-tappable).
 */
export const PhraseTokenSchema = z.object({
  /** 1-based position in the page. */
  index: z.number().int().positive(),
  /** Original Simplified-Chinese text of this token (or literal punctuation/newline). */
  original: z.string(),
  /** Pinyin with tone marks; null for non-word tokens. */
  pinyin: z.string().nullable(),
  /** Standard English translation; null for non-word tokens. */
  translation: z.string().nullable(),
  /** How the phrase is used in this passage; null for non-word tokens. */
  contextualMeaning: z.string().nullable(),
});

/** Structured analysis result: an ordered list of tokens. */
export const AnalysisResultSchema = z.object({
  tokens: z.array(PhraseTokenSchema),
});

/** One analysed token (word or punctuation/whitespace). */
export type PhraseToken = z.infer<typeof PhraseTokenSchema>;

/** Validated analysis result. */
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * The analysis system prompt. Encodes the intent from
 * specs/04-llm-pipeline.md: exact reconstruction, meaningful phrasing with
 * idioms/compounds/proper nouns kept whole, never per-character unless the
 * character truly stands alone, pinyin/translation/contextualMeaning for words,
 * null analysis for punctuation/whitespace, 1-based contiguous indexing.
 */
export function buildAnalysisSystemPrompt(): string {
  return [
    'You are a Mandarin reading tutor analysing a passage of Simplified Chinese.',
    '',
    'Split the passage into an ordered list of tokens. The tokens, concatenated',
    'in order with nothing added or removed, MUST reproduce the input passage',
    'EXACTLY — including every punctuation mark, space, and line break.',
    '',
    'Segmentation rules:',
    '- Group characters into MEANINGFUL phrases. Keep four-character idioms (成语),',
    '  compound words, and proper nouns WHOLE — never split them.',
    '- Do not split a phrase character-by-character unless the character truly',
    '  stands alone as its own word.',
    '- Consider the whole passage for context, not each phrase in isolation.',
    '',
    'For each WORD token, provide:',
    '- pinyin: pinyin with tone marks,',
    '- translation: a standard English translation,',
    '- contextualMeaning: how the phrase is used in THIS passage.',
    '',
    'For PUNCTUATION or WHITESPACE tokens (including newlines), set pinyin,',
    'translation, and contextualMeaning all to null.',
    '',
    'Number the tokens with "index" starting at 1 and increasing by 1 with no gaps.',
  ].join('\n');
}
