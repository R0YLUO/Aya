// ScanErrorScreen — inline error state for the scan path (PRD: "All errors
// shown inline with a clear CTA to retry or retake"). Given a typed
// ScanErrorCode it renders the PRD copy and a single recovery CTA, and routes
// the press to the right handler:
//
//   image_unreadable / no_chinese_text / image_not_found -> "Retake" -> onRetake
//   network_error / analysis_failed / validation_error / share_not_found
//                                                       -> "Retry"  -> onRetry
//
// This is a thin view over errors/messages.ts — all copy and CTA routing come
// from presentScanError, never from inline strings or message-text branching.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  presentScanError,
  recoveryHandler,
  type ScanErrorCode,
} from './messages.js';

export interface ScanErrorScreenProps {
  code: ScanErrorCode;
  /** Send the user back to the camera to capture a new photo. */
  onRetake: () => void;
  /** Re-run upload + scan with the same photo. */
  onRetry: () => void;
}

export function ScanErrorScreen({
  code,
  onRetake,
  onRetry,
}: ScanErrorScreenProps): React.ReactElement {
  const { message, ctaLabel } = presentScanError(code);
  const onPress = recoveryHandler(code, { onRetake, onRetry });

  return (
    <View style={styles.container} testID="scan-error-screen">
      <Text style={styles.message} testID="scan-error-message">
        {message}
      </Text>
      <TouchableOpacity
        style={styles.cta}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        testID="scan-error-cta"
      >
        <Text style={styles.ctaLabel}>{ctaLabel}</Text>
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
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  cta: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  ctaLabel: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
