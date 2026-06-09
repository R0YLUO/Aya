// Public entry for the @aya/mobile app.
//
// Re-exports the typed API client and (as later tasks land) the app's screens,
// local store, and reader components. The mobile client depends ONLY on
// @aya/shared and the HTTP API — never on @aya/api / @aya/llm.

export {
  AyaApiClient,
  ApiError,
  type ApiClientConfig,
  type FetchLike,
  type FetchResponse,
} from './api/index.js';

export {
  CameraCaptureScreen,
  captureReducer,
  initialCaptureState,
  type CameraCaptureScreenProps,
  type CameraService,
  type CapturedPhoto,
  type CaptureState,
  type CaptureAction,
} from './camera/index.js';

export {
  LocalPageStore,
  createAsyncStorageBackend,
  createInMemoryBackend,
  type PageStore,
  type StorageBackend,
  type AsyncStorageLike,
} from './store/index.js';

export {
  runScan,
  useScanFlow,
  ScanningScreen,
  scanReducer,
  initialScanState,
  type ScanDeps,
  type UseScanFlow,
  type ScanState,
  type ScanEvent,
  type ScanningScreenProps,
} from './scan/index.js';
