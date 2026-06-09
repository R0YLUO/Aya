// Public barrel for @aya/shared.
//
// This is the single entry point every other package imports from. Domain types
// (Page, Phrase, Share, AnalyzedPage), their Zod contracts, and shared helpers
// are re-exported here — see specs/02-data-model.md and specs/03-api-design.md.

export type { Page, Phrase, Share, AnalyzedPage } from './domain.js';
