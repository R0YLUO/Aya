'use client';

// The reader as shipped to users: the Reader plus the hover-to-translate popup
// on every interactive phrase. This is what the /s/{code} page renders.

import type { AnalyzedPage } from '@aya/shared';
import { Reader } from './Reader';
import { InteractivePhrase } from './PhrasePopup';

export function ReaderWithPopups({ page }: { page: AnalyzedPage }) {
  return (
    <Reader
      page={page}
      renderInteractive={(phrase, element) => (
        <InteractivePhrase phrase={phrase} trigger={element} />
      )}
    />
  );
}
