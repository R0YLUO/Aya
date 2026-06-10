// CameraCaptureScreen — PRD Story 1: present a camera view, capture a page
// photo, then show a preview with Confirm / Retake before submission.
//
// The live-camera surface is provided by an injected `CameraService` so this
// component carries no hard dependency on a specific native camera module; the
// state transitions live in the pure `captureReducer` (unit-tested separately).

import React, { useCallback, useReducer, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  captureReducer,
  initialCaptureState,
  type CameraService,
  type CapturedPhoto,
} from './types';

export interface CameraCaptureScreenProps {
  camera: CameraService;
  /** Called when the user confirms a photo; the scan flow takes over from here. */
  onConfirm: (photo: CapturedPhoto) => void;
}

export function CameraCaptureScreen({
  camera,
  onConfirm,
}: CameraCaptureScreenProps): React.ReactElement {
  const [state, dispatch] = useReducer(captureReducer, initialCaptureState);
  const [capturing, setCapturing] = useState(false);

  const onCapture = useCallback(async () => {
    setCapturing(true);
    try {
      const photo = await camera.capture();
      dispatch({ type: 'captured', photo });
    } finally {
      setCapturing(false);
    }
  }, [camera]);

  const onRetake = useCallback(() => dispatch({ type: 'retake' }), []);

  const onConfirmPress = useCallback(() => {
    if (state.status === 'preview') {
      const { photo } = state;
      dispatch({ type: 'confirm' });
      onConfirm(photo);
    }
  }, [state, onConfirm]);

  if (state.status === 'preview' || state.status === 'confirmed') {
    return (
      <View style={styles.container} testID="capture-preview">
        <Image
          source={{ uri: state.photo.uri }}
          style={styles.preview}
          resizeMode="contain"
          accessibilityLabel="Captured page preview"
        />
        <View style={styles.controls}>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={onRetake}
            accessibilityRole="button"
            testID="retake-button"
          >
            <Text style={styles.buttonText}>Retake</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.primary]}
            onPress={onConfirmPress}
            accessibilityRole="button"
            testID="confirm-button"
          >
            <Text style={styles.buttonText}>Use photo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Live camera view.
  return (
    <View style={styles.container} testID="camera-view">
      <View style={styles.viewfinder}>
        <Text style={styles.hint}>Frame the page, then tap to capture</Text>
      </View>
      <View style={styles.controls}>
        <Pressable
          style={[styles.button, styles.primary, styles.shutter]}
          onPress={onCapture}
          disabled={capturing}
          accessibilityRole="button"
          accessibilityLabel="Capture photo"
          testID="capture-button"
        >
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Capture</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  viewfinder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: '#fff', fontSize: 16 },
  preview: { flex: 1, width: '100%' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  shutter: { minWidth: 160 },
  primary: { backgroundColor: '#2563eb' },
  secondary: { backgroundColor: '#374151' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
