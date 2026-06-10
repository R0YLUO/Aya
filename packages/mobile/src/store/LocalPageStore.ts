// LocalPageStore — persists AnalyzedPage objects on device behind an injectable
// StorageBackend. Every value is validated against the shared AnalyzedPageSchema
// on read and write, so corrupt/legacy data can never flow into the reader
// (North Star: Reliable & Stable).
//
// Note: only the analysed text is stored — never image bytes. Photos are
// discarded after submission (PRD security constraint), so there is nothing
// here to retain.

import { AnalyzedPageSchema, type AnalyzedPage } from '@aya/shared';
import type { PageStore, StorageBackend } from './types.js';

const KEY_PREFIX = 'aya:page:';

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export class LocalPageStore implements PageStore {
  private readonly backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  async savePage(page: AnalyzedPage): Promise<void> {
    // Validate before persisting so only well-formed pages ever land on disk.
    const valid = AnalyzedPageSchema.parse(page);
    await this.backend.setItem(keyFor(valid.page.id), JSON.stringify(valid));
  }

  async getPage(id: string): Promise<AnalyzedPage | null> {
    const raw = await this.backend.getItem(keyFor(id));
    if (raw === null) {
      return null;
    }
    return this.decode(raw);
  }

  async listPages(): Promise<AnalyzedPage[]> {
    const keys = (await this.backend.getAllKeys()).filter((k) =>
      k.startsWith(KEY_PREFIX),
    );
    const raws = await Promise.all(keys.map((k) => this.backend.getItem(k)));
    const pages: AnalyzedPage[] = [];
    for (const raw of raws) {
      if (raw === null) {
        continue;
      }
      const decoded = this.decode(raw);
      if (decoded !== null) {
        pages.push(decoded);
      }
    }
    // Most-recently-created first.
    pages.sort((a, b) => b.page.createdAt.localeCompare(a.page.createdAt));
    return pages;
  }

  async deletePage(id: string): Promise<void> {
    await this.backend.removeItem(keyFor(id));
  }

  /** Parse + validate a stored value; returns null on corrupt data. */
  private decode(raw: string): AnalyzedPage | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const result = AnalyzedPageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  }
}
