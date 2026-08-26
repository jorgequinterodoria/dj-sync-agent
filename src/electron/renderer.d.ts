import type {
  DJSyncRendererApi,
} from './ipc/contracts.js';

declare global {
  interface Window {
    djSync: DJSyncRendererApi;
  }
}

export {};