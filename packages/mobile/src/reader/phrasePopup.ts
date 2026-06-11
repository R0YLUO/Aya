// Phrase popup model (framework-free, unit-tested).
//
// PRD Story 3: tapping an interactive phrase opens a popup/bottom sheet showing
// the phrase's analysis, instantly and with no network call (all data is the
// AnalyzedPage already held in memory by the reader). The MVP fields are
// pinyin, contextual translation, and contextual meaning — character breakdown
// and example sentences are deferred (ADR-0003).
//
// This module owns the pure logic — which phrase the popup is showing and the
// content it presents — independent of React Native, so the open/dismiss
// behaviour and the field selection are testable under node:test. The thin RN
// bottom sheet (PhrasePopupSheet.tsx) renders this state.

import { isInteractive } from './tokens.js';
import type { Phrase } from '@aya/shared';

/**
 * Popup visibility state. `null` means closed; otherwise it carries the phrase
 * currently being looked up. The reader keeps one of these and feeds it to the
 * sheet.
 */
export type PhrasePopupState = { phrase: Phrase } | null;

/** The closed popup. */
export const closedPhrasePopup: PhrasePopupState = null;

/**
 * Open the popup for a tapped phrase. Only interactive phrases (analysis
 * present) open the sheet — tapping a non-tappable token (punctuation,
 * whitespace, newline) is a no-op and leaves the previous state unchanged.
 */
export function openPhrasePopup(
  state: PhrasePopupState,
  phrase: Phrase,
): PhrasePopupState {
  if (!isInteractive(phrase)) {
    return state;
  }
  return { phrase };
}

/**
 * Close the popup. Used by all three dismissal affordances — tap-outside,
 * swipe-down, and the close button — so there is one place dismissal lives.
 */
export function closePhrasePopup(): PhrasePopupState {
  return closedPhrasePopup;
}

/** Whether the popup is currently open. */
export function isPhrasePopupOpen(state: PhrasePopupState): boolean {
  return state !== null;
}

/** The MVP fields rendered in the popup for an interactive phrase. */
export interface PhrasePopupContent {
  pinyin: string;
  translation: string;
  contextualMeaning: string;
}

/**
 * The content the sheet displays for a phrase, or `null` if the phrase carries
 * no analysis (and therefore should never have opened the popup). Narrows the
 * nullable analysis fields to the non-null MVP triple.
 */
export function phrasePopupContent(phrase: Phrase): PhrasePopupContent | null {
  if (
    phrase.pinyin === null ||
    phrase.translation === null ||
    phrase.contextualMeaning === null
  ) {
    return null;
  }
  return {
    pinyin: phrase.pinyin,
    translation: phrase.translation,
    contextualMeaning: phrase.contextualMeaning,
  };
}
