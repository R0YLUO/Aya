// Camera domain types and the capture-flow state machine, kept framework-free so
// the flow can be unit-tested without a device. The React Native screen
// (CameraCaptureScreen.tsx) is a thin view over this state.

/** A photo captured by the device camera, held only until it is submitted. */
export interface CapturedPhoto {
  /** Local file URI (e.g. file:///.../photo.jpg) the preview renders. */
  uri: string;
  /** MIME type of the encoded image; defaults to image/jpeg. */
  contentType: string;
}

/**
 * The capture flow has three states:
 *  - `camera`:  live camera view, awaiting a shot.
 *  - `preview`: a photo is captured; user can Confirm or Retake.
 *  - `confirmed`: user accepted the photo; the scan flow takes over.
 */
export type CaptureState =
  | { status: 'camera' }
  | { status: 'preview'; photo: CapturedPhoto }
  | { status: 'confirmed'; photo: CapturedPhoto };

export type CaptureAction =
  | { type: 'captured'; photo: CapturedPhoto }
  | { type: 'retake' }
  | { type: 'confirm' };

/** Injectable camera so screens/tests don't depend on a native module. */
export interface CameraService {
  /** Capture a still photo from the live camera. */
  capture(): Promise<CapturedPhoto>;
  /** Read the captured photo's bytes for upload, then it may be discarded. */
  readBytes(photo: CapturedPhoto): Promise<Uint8Array>;
}

export const initialCaptureState: CaptureState = { status: 'camera' };

/**
 * Pure reducer driving the capture screen. Invalid transitions (e.g. confirming
 * with no photo) are no-ops, keeping the UI robust.
 */
export function captureReducer(
  state: CaptureState,
  action: CaptureAction,
): CaptureState {
  switch (action.type) {
    case 'captured':
      // A new capture always moves to preview, whatever the prior state.
      return { status: 'preview', photo: action.photo };
    case 'retake':
      // Discard the photo and return to the live camera.
      return { status: 'camera' };
    case 'confirm':
      return state.status === 'preview'
        ? { status: 'confirmed', photo: state.photo }
        : state;
    default:
      return state;
  }
}
