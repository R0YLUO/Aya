// Public barrel for @aya/shared.
//
// This is the single entry point every other package imports from. Domain types
// (Page, Phrase, Share) and their Zod request/response contracts are re-exported
// here as they land — see specs/02-data-model.md and specs/03-api-design.md.
//
// Intentionally empty for now: the scaffold establishes the package and its build
// so dependents can `import { ... } from '@aya/shared'` the moment contracts exist.
export {};
