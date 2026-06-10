import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureReducer,
  initialCaptureState,
  type CapturedPhoto,
} from './types.js';

const photo: CapturedPhoto = {
  uri: 'file:///tmp/page.jpg',
  contentType: 'image/jpeg',
};

test('starts in the camera state', () => {
  assert.deepEqual(initialCaptureState, { status: 'camera' });
});

test('capturing a photo moves to preview', () => {
  const next = captureReducer(initialCaptureState, { type: 'captured', photo });
  assert.deepEqual(next, { status: 'preview', photo });
});

test('retake from preview returns to the camera (discards photo)', () => {
  const preview = captureReducer(initialCaptureState, { type: 'captured', photo });
  const next = captureReducer(preview, { type: 'retake' });
  assert.deepEqual(next, { status: 'camera' });
});

test('confirm from preview proceeds with the same photo', () => {
  const preview = captureReducer(initialCaptureState, { type: 'captured', photo });
  const next = captureReducer(preview, { type: 'confirm' });
  assert.deepEqual(next, { status: 'confirmed', photo });
});

test('confirm with no photo is a no-op', () => {
  const next = captureReducer(initialCaptureState, { type: 'confirm' });
  assert.deepEqual(next, { status: 'camera' });
});

test('a fresh capture from preview replaces the photo', () => {
  const preview = captureReducer(initialCaptureState, { type: 'captured', photo });
  const photo2: CapturedPhoto = { uri: 'file:///tmp/page2.jpg', contentType: 'image/jpeg' };
  const next = captureReducer(preview, { type: 'captured', photo: photo2 });
  assert.deepEqual(next, { status: 'preview', photo: photo2 });
});
