// ShareScreen — the share action's UI over useShareFlow.
//
// Tapping Share on a stored page POSTs it to /shares (useShareFlow → runShare),
// then:
//   - success: the minted short URL is displayed, with "Share" (native share
//     sheet) and "Copy" (clipboard) actions.
//   - error:   an inline message + a single "Retry" CTA (re-runs the share).
//     All copy/CTA routing comes from errors/messages.ts — never inline strings
//     or message-text branching.
//
// The ShareSheet (native share / clipboard) is injected so this screen and its
// tests stay device-free.

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { AnalyzedPage } from '@aya/shared';
import { presentScanError } from '../errors/messages.js';
import type { ShareState } from './shareState.js';
import type { ShareSheet } from './shareSheet.js';

export interface ShareScreenProps {
  /** The stored page being shared (the body of POST /shares). */
  page: AnalyzedPage;
  /** Current share-flow state (from useShareFlow). */
  state: ShareState;
  /** Kicks off (or retries) the share for the stored page. */
  onShare: (page: AnalyzedPage) => void;
  /** Native presentation seam (share sheet / clipboard). */
  shareSheet: ShareSheet;
}

export function ShareScreen({
  page,
  state,
  onShare,
  shareSheet,
}: ShareScreenProps): React.ReactElement {
  if (state.status === 'sharing') {
    return (
      <View style={styles.container} testID="share-screen">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.hint}>Creating your share link…</Text>
      </View>
    );
  }

  if (state.status === 'success') {
    const { url } = state.share;
    return (
      <View style={styles.container} testID="share-screen">
        <Text style={styles.heading}>Your shareable link</Text>
        <Text style={styles.url} testID="share-url" selectable>
          {url}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cta}
            onPress={() => void shareSheet.present(url)}
            accessibilityRole="button"
            accessibilityLabel="Share link"
            testID="share-present-cta"
          >
            <Text style={styles.ctaLabel}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cta, styles.ctaSecondary]}
            onPress={() => void shareSheet.copy(url)}
            accessibilityRole="button"
            accessibilityLabel="Copy link"
            testID="share-copy-cta"
          >
            <Text style={[styles.ctaLabel, styles.ctaLabelSecondary]}>Copy</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    // Inline error with a retry CTA — re-runs the share for the same page.
    const { message } = presentScanError(state.code);
    return (
      <View style={styles.container} testID="share-screen">
        <Text style={styles.message} testID="share-error-message">
          {message}
        </Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => onShare(page)}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          testID="share-error-cta"
        >
          <Text style={styles.ctaLabel}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // idle — offer the share action.
  return (
    <View style={styles.container} testID="share-screen">
      <TouchableOpacity
        style={styles.cta}
        onPress={() => onShare(page)}
        accessibilityRole="button"
        accessibilityLabel="Share this page"
        testID="share-cta"
      >
        <Text style={styles.ctaLabel}>Share</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  heading: { fontSize: 18, fontWeight: '600', color: '#111827' },
  url: {
    marginTop: 16,
    fontSize: 16,
    color: '#2563eb',
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', marginTop: 24, gap: 12 },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  hint: { marginTop: 20, fontSize: 14, color: '#6b7280' },
  cta: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  ctaSecondary: { backgroundColor: '#e5e7eb' },
  ctaLabel: { fontSize: 16, fontWeight: '600', color: '#fff' },
  ctaLabelSecondary: { color: '#111827' },
});
