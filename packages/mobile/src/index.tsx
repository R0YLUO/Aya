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
