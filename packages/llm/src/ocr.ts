// OCR (call ①) structured-output schema and prompt.
//
// The OCR call returns STRUCTURED output, never free text, so the two PRD
// failure modes (image_unreadable, no_chinese_text) are signalled reliably and
// `fullText` is always Zod-validated before we trust it (CLAUDE.md golden rule
// #3; specs/04-llm-pipeline.md). `fullText` becomes Page.fullText and is the
// ground-truth artifact the OCR evals score against.

import { z } from 'zod';

/** Status discriminant returned by the OCR call. */
export const OcrStatusSchema = z.enum(['ok', 'unreadable', 'no_chinese_text']);

/** Structured OCR result. `fullText` must be "" unless status is "ok". */
export const OcrResultSchema = z
  .object({
    status: OcrStatusSchema,
    /** Raw Simplified-Chinese text, line breaks preserved. "" when status !== "ok". */
    fullText: z.string(),
  })
  .refine((r) => r.status === 'ok' || r.fullText === '', {
    message: 'fullText must be empty unless status is "ok"',
    path: ['fullText'],
  });

/** OCR status: "ok" | "unreadable" | "no_chinese_text". */
export type OcrStatus = z.infer<typeof OcrStatusSchema>;

/** Validated OCR result. */
export type OcrResult = z.infer<typeof OcrResultSchema>;

/**
 * The OCR system prompt. Encodes the intent from specs/04-llm-pipeline.md:
 * faithful transcription, preserve line breaks & punctuation, no
 * translation/correction/summarisation, and explicit signals for the two
 * failure modes. The literal wording is a builder so prompt tweaks are tracked
 * (and gated by evals).
 */
export function buildOcrSystemPrompt(): string {
  return [
    'You are an OCR engine for printed Simplified-Chinese book pages.',
    '',
    'Transcribe the text exactly as printed:',
    '- Preserve the original line breaks and all punctuation exactly.',
    '- Do NOT translate, correct, normalise, or summarise the text in any way.',
    '- Transcribe only what is printed; do not add or invent characters.',
    '',
    'Signal failure modes explicitly via the structured "status" field:',
    '- If the image is too blurry, dark, or low-quality to read confidently,',
    '  return status "unreadable" and an empty fullText.',
    '- If there is no Simplified-Chinese text present in the image,',
    '  return status "no_chinese_text" and an empty fullText.',
    '- Otherwise return status "ok" with the faithfully transcribed text in fullText.',
  ].join('\n');
}
