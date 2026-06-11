// PhrasePopupSheet — PRD Story 3: the tap-triggered bottom sheet that shows a
// phrase's analysis (pinyin, contextual translation, contextual meaning — the
// MVP fields per ADR-0003). All data comes from the AnalyzedPage already held
// in memory by the reader, so opening the sheet is instant and makes NO network
// call.
//
// Dismissal — all three affordances route through `onDismiss`:
//   - tap outside (press the dimmed backdrop)
//   - swipe down (drag the sheet past a threshold)
//   - the close button
//
// This is a thin view over reader/phrasePopup.ts: it renders the popup state
// and selects the fields via `phrasePopupContent`. A null-analysis phrase can
// never reach here (the reader only opens the popup for interactive tokens),
// but we guard and render nothing if it somehow does.

import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Phrase } from '@aya/shared';
import { phrasePopupContent } from './phrasePopup.js';

export interface PhrasePopupSheetProps {
  /** The phrase to look up, or null when the sheet is closed. */
  phrase: Phrase | null;
  /** Close the sheet — wired to backdrop tap, swipe-down, and close button. */
  onDismiss: () => void;
}

// Drag distance (px) past which a downward swipe dismisses the sheet.
const SWIPE_DISMISS_THRESHOLD = 80;

export function PhrasePopupSheet({
  phrase,
  onDismiss,
}: PhrasePopupSheetProps): React.ReactElement | null {
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      // Only claim downward drags so taps still hit the close button.
      onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dy > 4,
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > SWIPE_DISMISS_THRESHOLD) {
          onDismiss();
        }
        // Snap back whether dismissed or not (sheet unmounts on dismiss).
        Animated.timing(translateY, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  if (phrase === null) {
    return null;
  }
  const content = phrasePopupContent(phrase);
  if (content === null) {
    // A non-analysed token should never open the sheet; render nothing.
    return null;
  }

  return (
    <View style={styles.overlay} testID="phrase-popup-overlay">
      {/* Tap-outside: pressing the dimmed backdrop dismisses. */}
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        testID="phrase-popup-backdrop"
      />
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY }] }]}
        testID="phrase-popup-sheet"
        accessibilityViewIsModal
        {...panResponder.panHandlers}
      >
        {/* Grab handle — the swipe-down affordance. */}
        <View style={styles.handle} testID="phrase-popup-handle" />

        <View style={styles.header}>
          <Text style={styles.original} testID="popup-original">
            {phrase.original}
          </Text>
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="phrase-popup-close"
            hitSlop={12}
            style={styles.close}
          >
            <Text style={styles.closeLabel}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.pinyin} testID="popup-pinyin">
          {content.pinyin}
        </Text>
        <Text style={styles.translation} testID="popup-translation">
          {content.translation}
        </Text>
        <Text style={styles.contextual} testID="popup-contextual">
          {content.contextualMeaning}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  original: { fontSize: 28, fontWeight: '700', color: '#111827' },
  close: { padding: 4 },
  closeLabel: { fontSize: 18, color: '#6b7280' },
  pinyin: { marginTop: 8, fontSize: 18, fontWeight: '600', color: '#2563eb' },
  translation: { marginTop: 8, fontSize: 18, color: '#111827' },
  contextual: { marginTop: 8, fontSize: 16, color: '#4b5563', lineHeight: 22 },
});
