// ScanningScreen — the non-blocking loading state shown during the ~15s
// upload+OCR+analysis. An ActivityIndicator animates on the UI thread while the
// scan promise resolves; the screen never freezes (PRD performance constraint).

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export interface ScanningScreenProps {
  /** Optional progress copy, e.g. "Reading the page…". */
  message?: string;
}

export function ScanningScreen({
  message = 'Reading the page…',
}: ScanningScreenProps): React.ReactElement {
  return (
    <View style={styles.container} testID="scanning-screen">
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.hint}>This usually takes a few seconds.</Text>
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
  message: { marginTop: 20, fontSize: 18, fontWeight: '600', color: '#111827' },
  hint: { marginTop: 8, fontSize: 14, color: '#6b7280' },
});
