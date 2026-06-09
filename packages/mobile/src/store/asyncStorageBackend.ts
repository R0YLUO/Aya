// Adapter turning React Native's AsyncStorage into our StorageBackend.
//
// AsyncStorage is the device-persistent KV store on React Native; its data
// survives app reloads. We accept it via injection (rather than importing the
// native module directly) so the store stays framework-free and testable, and
// so the app owns the single AsyncStorage import at startup.

import type { StorageBackend } from './types.js';

/** The subset of @react-native-async-storage/async-storage we rely on. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export function createAsyncStorageBackend(
  asyncStorage: AsyncStorageLike,
): StorageBackend {
  return {
    getItem: (key) => asyncStorage.getItem(key),
    setItem: (key, value) => asyncStorage.setItem(key, value),
    removeItem: (key) => asyncStorage.removeItem(key),
    getAllKeys: () => asyncStorage.getAllKeys(),
  };
}

/**
 * An in-memory StorageBackend. Used as a safe default before AsyncStorage is
 * wired and in tests; data does NOT survive process restart (the device build
 * must inject AsyncStorage for true persistence).
 */
export function createInMemoryBackend(
  seed?: Map<string, string>,
): StorageBackend {
  const map = seed ?? new Map<string, string>();
  return {
    getItem: async (key) => (map.has(key) ? map.get(key)! : null),
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
    getAllKeys: async () => [...map.keys()],
  };
}
