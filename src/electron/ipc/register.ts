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
  const audioService =
    createDefaultDJSyncAudioApplicationService(
      options.library,
    );

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
      return audioService.status(
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
      return audioService.analyze(
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
      return audioService
        .analyzeAndPersist(
          trackId,
        );
    },
  );
}