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

export {
  ReaderView,
  isInteractive,
  readerTokens,
  reconstructText,
  PhrasePopupSheet,
  openPhrasePopup,
  closePhrasePopup,
  closedPhrasePopup,
  isPhrasePopupOpen,
  phrasePopupContent,
  type ReaderViewProps,
  type ReaderToken,
  type PhrasePopupSheetProps,
  type PhrasePopupState,
  type PhrasePopupContent,
} from './reader/index.js';

export {
  ScanErrorScreen,
  presentScanError,
  recoveryHandler,
  type ScanErrorScreenProps,
  type ScanErrorCode,
  type ScanErrorPresentation,
  type RecoveryCta,
} from './errors/index.js';

export {
  runShare,
  useShareFlow,
  ShareScreen,
  shareReducer,
  initialShareState,
  createNativeShareSheet,
  type ShareDeps,
  type UseShareFlow,
  type ShareScreenProps,
  type ShareState,
  type ShareEvent,
  type ShareErrorCode,
  type ShareSheet,
  type ClipboardLike,
  type NativeShareSheetDeps,
} from './share/index.js';
