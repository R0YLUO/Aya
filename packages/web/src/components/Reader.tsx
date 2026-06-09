'use client';

// The web reader: renders an AnalyzedPage as clean, scrollable text.
//
// Rendering contract (specs/01-system-overview.md, 03-api-design.md):
// - Phrases are rendered in ascending `index` order; concatenating each
//   `original` reproduces `page.fullText` exactly, line breaks included.
// - A token is INTERACTIVE iff its analysis is present (`pinyin !== null`):
//   it renders as a focusable element a learner can hover/tap for the popup.
// - A token with null analysis (punctuation / whitespace / newline) renders as
//   plain, non-interactive text.
// - No raw image is ever shown — we only render analysed text.

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import type { AnalyzedPage, Phrase } from '@aya/shared';

/** The interactive element the Reader produces for a phrase: a focusable button. */
export type PhraseTrigger = ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;

/** A phrase is interactive iff it carries analysis (pinyin present). */
export function isInteractive(phrase: Phrase): boolean {
  return phrase.pinyin !== null;
}

export interface ReaderProps {
  page: AnalyzedPage;
  /**
   * Optional renderer for an interactive phrase. The reader supplies the phrase
   * and a ready-made interactive element; callers (e.g. the popup layer) can
   * wrap it. Defaults to rendering the interactive element as-is.
   */
  renderInteractive?: (phrase: Phrase, element: PhraseTrigger) => ReactNode;
}

/**
 * Render one analysed page. Phrases are sorted by `index` defensively so the
 * visual order always reproduces `fullText`, even if the input array is not
 * pre-sorted.
 */
export function Reader({ page, renderInteractive }: ReaderProps) {
  const phrases = [...page.phrases].sort((a, b) => a.index - b.index);

  return (
    <article
      aria-label="Shared page"
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        lineHeight: 2,
        fontSize: '1.375rem',
        maxWidth: '42rem',
        margin: '0 auto',
        padding: '2rem 1rem',
      }}
    >
      {phrases.map((phrase) => {
        if (!isInteractive(phrase)) {
          // Plain, non-interactive text node (punctuation / whitespace / newline).
          // A Fragment keeps it a bare text node so pre-wrap preserves breaks.
          return <span key={phrase.id}>{phrase.original}</span>;
        }

        const interactive = (
          <button
            type="button"
            data-testid="phrase"
            data-index={phrase.index}
            className="aya-phrase"
            style={{
              // Reset button chrome so it reads as inline text, but stays a
              // real focusable/tappable control.
              font: 'inherit',
              color: 'inherit',
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              borderBottom: '1px dotted currentColor',
            }}
          >
            {phrase.original}
          </button>
        );

        return (
          <span key={phrase.id}>
            {renderInteractive ? renderInteractive(phrase, interactive) : interactive}
          </span>
        );
      })}
    </article>
  );
}
