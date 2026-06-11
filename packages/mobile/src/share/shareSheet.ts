// ShareSheet — the injectable native-presentation seam for a minted short URL.
//
// Kept behind an interface (like CameraService / StorageBackend) so the share
// UI and its tests never touch React Native's Share / Clipboard modules
// directly. The default adapter wires the platform modules; tests inject a fake.

import { Share } from 'react-native';

/** Presents a minted share URL to the user (native share sheet / clipboard). */
export interface ShareSheet {
  /** Open the OS share sheet with the short URL. */
  present(url: string): Promise<void>;
  /** Copy the short URL to the clipboard. */
  copy(url: string): Promise<void>;
}

/** Minimal clipboard surface (matches @react-native-clipboard/clipboard). */
export interface ClipboardLike {
  setString(text: string): void;
}

export interface NativeShareSheetDeps {
  /**
   * Clipboard module. Optional so the app can run before the native clipboard
   * dependency is installed; `copy` is then a no-op-safe fallback.
   */
  clipboard?: ClipboardLike;
}

/**
 * Default {@link ShareSheet} over React Native's `Share` API and an injected
 * clipboard module. `present` opens the OS share sheet; `copy` writes to the
 * clipboard (no-op if no clipboard module was provided).
 */
export function createNativeShareSheet(
  deps: NativeShareSheetDeps = {},
): ShareSheet {
  return {
    async present(url: string): Promise<void> {
      await Share.share({ message: url, url });
    },
    async copy(url: string): Promise<void> {
      deps.clipboard?.setString(url);
    },
  };
}
