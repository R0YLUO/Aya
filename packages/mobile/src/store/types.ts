// Local-first store contracts for scanned pages.
//
// The mobile app is local-first: a scanned AnalyzedPage is persisted on device
// so it survives an app reload (PRD: read at your own pace, no account). The
// concrete storage choice (AsyncStorage) is owned here and hidden behind a tiny
// async key-value `StorageBackend` so the store logic is unit-testable.

import type { AnalyzedPage } from '@aya/shared';

/** Minimal async key-value persistence (AsyncStorage-compatible subset). */
export interface StorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** All keys currently stored (used to list saved pages). */
  getAllKeys(): Promise<readonly string[]>;
}

/** The typed local store surface the app uses. */
export interface PageStore {
  /** Persist (or overwrite) an analysed page, keyed by its page id. */
  savePage(page: AnalyzedPage): Promise<void>;
  /** Load one analysed page by its page id, or null if absent. */
  getPage(id: string): Promise<AnalyzedPage | null>;
  /** List all stored pages, most-recently-created first. */
  listPages(): Promise<AnalyzedPage[]>;
  /** Remove a stored page. */
  deletePage(id: string): Promise<void>;
}
