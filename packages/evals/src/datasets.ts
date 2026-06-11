// Dataset schemas + loader.
//
// Datasets are versioned JSON fixtures under packages/evals/datasets/<name>/<version>.json.
// They are Zod-validated on load so a malformed fixture fails loudly rather than
// silently skewing scores. The fixtures are the local source of truth; they are
// mirrored into LangSmith datasets when its env is present (see langsmith.ts).

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

/** An OCR example: an image reference paired with the gold structured result. */
export const OcrExampleSchema = z.object({
  id: z.string().min(1),
  image: z.union([
    z.object({ kind: z.literal('url'), url: z.string().min(1) }),
    z.object({
      kind: z.literal('bytes'),
      data: z.string().min(1),
      mediaType: z.string().min(1),
    }),
  ]),
  expected: z.object({
    status: z.enum(['ok', 'unreadable', 'no_chinese_text']),
    fullText: z.string(),
  }),
});

export const OcrDatasetSchema = z.object({
  name: z.literal('ocr'),
  version: z.string().min(1),
  description: z.string().optional(),
  examples: z.array(OcrExampleSchema).min(1),
});

/**
 * An analysis example: fullText paired with gold word-token boundaries (in order)
 * and expected pinyin for a subset of words. `goldBoundaries.join('')` must equal
 * `fullText` so the reconstruction invariant holds for the gold itself.
 */
export const AnalysisExampleSchema = z
  .object({
    id: z.string().min(1),
    pageId: z.string().min(1),
    fullText: z.string().min(1),
    goldBoundaries: z.array(z.string()).min(1),
    goldPinyin: z.record(z.string(), z.string()).default({}),
  })
  .refine((ex) => ex.goldBoundaries.join('') === ex.fullText, {
    message: 'goldBoundaries.join("") must equal fullText (reconstruction invariant)',
    path: ['goldBoundaries'],
  });

export const AnalysisDatasetSchema = z.object({
  name: z.literal('analysis'),
  version: z.string().min(1),
  description: z.string().optional(),
  examples: z.array(AnalysisExampleSchema).min(1),
});

export type OcrExample = z.infer<typeof OcrExampleSchema>;
export type OcrDataset = z.infer<typeof OcrDatasetSchema>;
export type AnalysisExample = z.infer<typeof AnalysisExampleSchema>;
export type AnalysisDataset = z.infer<typeof AnalysisDatasetSchema>;

/** Walk up from this module to the package root (the dir holding `datasets/`). */
async function findDatasetsDir(): Promise<string> {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'datasets');
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error('evals: could not locate the datasets/ directory');
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Load and validate the OCR dataset at the given version (default "v1"). */
export async function loadOcrDataset(version = 'v1'): Promise<OcrDataset> {
  const root = await findDatasetsDir();
  return OcrDatasetSchema.parse(await readJson(join(root, 'ocr', `${version}.json`)));
}

/** Load and validate the analysis dataset at the given version (default "v1"). */
export async function loadAnalysisDataset(version = 'v1'): Promise<AnalysisDataset> {
  const root = await findDatasetsDir();
  return AnalysisDatasetSchema.parse(
    await readJson(join(root, 'analysis', `${version}.json`)),
  );
}
