import {
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron';

import {
  IPC_CHANNELS,
} from './channels.js';

import type {
  AppInfo,
  LibraryListOptions,
} from './contracts.js';

import type {
  DJSyncApplicationState,
} from '../../runtime/dj-sync-application-state.js';

import type {
  RekordboxLibraryService,
} from '../../runtime/rekordbox-library.js';

import {
  createDefaultDJSyncAudioApplicationService,
} from '../../runtime/dj-sync-audio-service.js';

import {
  createDefaultDJSyncIntelligenceService,
} from '../../runtime/dj-sync-intelligence.js';

import {
  readUserSettings,
  writeUserSettings,
} from '../../config/user-settings.store.js';

export interface RegisterIpcHandlersOptions {
  applicationState:
    DJSyncApplicationState;

  library:
    RekordboxLibraryService;

  getAppInfo:
    () => AppInfo;
}

export function registerIpcHandlers(
  options:
    RegisterIpcHandlersOptions,
): void {
  let audioService:
    | ReturnType<
      typeof createDefaultDJSyncAudioApplicationService
    >
    | null =
    null;
  let audioInitError:
    | string
    | null =
    null;

  let intelligenceService:
    | ReturnType<
      typeof createDefaultDJSyncIntelligenceService
    >
    | null =
    null;
  let intelligenceInitError:
    | string
    | null =
    null;

  try {
    audioService =
      createDefaultDJSyncAudioApplicationService(
        options.library,
      );
  } catch (error) {
    audioInitError =
      error instanceof Error
        ? error.message
        : String(error);
  }

  try {
    intelligenceService =
      createDefaultDJSyncIntelligenceService(
        options.library,
      );
  } catch (error) {
    intelligenceInitError =
      error instanceof Error
        ? error.message
        : String(error);
  }

  function getAudioServiceOrThrow():
    | ReturnType<
      typeof createDefaultDJSyncAudioApplicationService
    > {
    if (audioService === null) {
      throw new Error(
        `Audio service unavailable: ${audioInitError ?? 'Unknown error'}`,
      );
    }

    return audioService;
  }

  function getIntelligenceServiceOrThrow():
    | ReturnType<
      typeof createDefaultDJSyncIntelligenceService
    > {
    if (intelligenceService === null) {
      throw new Error(
        `Intelligence service unavailable: ${
          intelligenceInitError ??
          'Configure SYNC_AGENT_ID and SYNC_API_KEY in Settings.'
        }`,
      );
    }

    return intelligenceService;
  }

  ipcMain.handle(
    IPC_CHANNELS.appGetInfo,
    (
      _event:
        IpcMainInvokeEvent,
    ) => {
      return options.getAppInfo();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationGetState,
    async () => {
      return options
        .applicationState
        .snapshot();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationRefresh,
    async () => {
      return options
        .applicationState
        .refresh();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationStart,
    async () => {
      return options
        .applicationState
        .start();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationStop,
    async () => {
      return options
        .applicationState
        .stop();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationRestart,
    async () => {
      return options
        .applicationState
        .restart();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.libraryList,
    async (
      _event,
      input:
        | LibraryListOptions
        | undefined,
    ) => {
      return options
        .library
        .list(
          input,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.libraryGet,
    async (
      _event,
      trackId: string,
    ) => {
      return options
        .library
        .getById(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.audioStatus,
    async (
      _event,
      trackId: string,
    ) => {
      return getAudioServiceOrThrow()
        .status(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.audioAnalyze,
    async (
      _event,
      trackId: string,
    ) => {
      return getAudioServiceOrThrow()
        .analyze(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.audioAnalyzeAndPersist,
    async (
      _event,
      trackId: string,
    ) => {
      return getAudioServiceOrThrow()
        .analyzeAndPersist(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligenceGet,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .get(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligenceRefresh,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .enqueueRefresh(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligencePreferenceUpdate,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .enqueuePreferenceUpdate(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligenceRetire,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .enqueueRetire(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsGet,
    async () => {
      return readUserSettings();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsSave,
    async (
      _event,
      input,
    ) => {
      const saved =
        writeUserSettings(
          input,
        );

      return saved;
    },
  );
}