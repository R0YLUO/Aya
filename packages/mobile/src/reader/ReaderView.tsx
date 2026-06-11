// ReaderView — PRD Story 2: render an AnalyzedPage as clean, scrollable,
// mobile-legible text with each pinyin-bearing phrase individually tappable.
//
// Rendering contract (see ./tokens):
//   - Phrases render in ascending `index` order; concatenating each `original`
//     reproduces `page.fullText` exactly, line breaks included. Because we emit
//     each token's literal `original` (newlines and all) inside a single
//     scrollable <Text>, RN preserves the page's line breaks.
//   - Interactive phrases (pinyin present) are tappable runs that call
//     `onPhrasePress` — the phrase popup layer (mobile-phrase-popup) wires this
//     up. Null-analysis tokens render as plain, non-tappable text.
//   - No raw image is shown; we only render analysed text.

import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { AnalyzedPage, Phrase } from '@aya/shared';
import { readerTokens } from './tokens.js';

export interface ReaderViewProps {
  page: AnalyzedPage;
  /** Called with the tapped phrase when an interactive token is pressed. */
  onPhrasePress?: (phrase: Phrase) => void;
}

export function ReaderView({
  page,
  onPhrasePress,
}: ReaderViewProps): React.ReactElement {
  const tokens = readerTokens(page);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      testID="reader-view"
    >
      <Text style={styles.body} testID="reader-text">
        {tokens.map(({ phrase, interactive }) => {
          if (!interactive) {
            // Plain, non-tappable text (punctuation / whitespace / newline).
            return (
              <Text key={phrase.id} style={styles.plain}>
                {phrase.original}
              </Text>
            );
          }
          return (
            <Text
              key={phrase.id}
              style={styles.phrase}
              testID="reader-phrase"
              accessibilityRole="button"
              accessibilityLabel={phrase.original}
              suppressHighlighting={false}
              onPress={
                onPhrasePress ? () => onPhrasePress(phrase) : undefined
              }
            >
              {phrase.original}
            </Text>
          );
        })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  // Mobile-legible base sizing with generous line height for CJK reading.
  body: { fontSize: 22, lineHeight: 38, color: '#111827' },
  plain: { color: '#111827' },
  // Interactive phrases get a subtle underline affordance so learners can see
  // what is tappable without cluttering the page.
  phrase: {
    color: '#111827',
    textDecorationLine: 'underline',
    textDecorationColor: '#9ca3af',
    textDecorationStyle: 'dotted',
  },
});
