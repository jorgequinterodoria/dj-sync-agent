import {
  app,
  BrowserWindow,
} from 'electron';

import { fileURLToPath } from 'node:url';

import {
  loadConfig,
} from '../config/env.js';

import {
  createDJSyncService,
} from '../runtime/dj-sync-service.js';

import {
  createDJSyncApplicationState,
} from '../runtime/dj-sync-application-state.js';

import {
  createRekordboxLibraryService,
} from '../runtime/rekordbox-library.js';

import {
  registerIpcHandlers,
} from './ipc/register.js';

import {
  IPC_CHANNELS,
} from './ipc/channels.js';

import type {
  AppInfo,
} from './ipc/contracts.js';

let mainWindow:
  | BrowserWindow
  | null =
  null;

const config =
  loadConfig();

const service =
  createDJSyncService();

const applicationState =
  createDJSyncApplicationState(
    service,
  );

const library =
  createRekordboxLibraryService(
    config,
  );

function getAppInfo(): AppInfo {
  return {
    name:
      app.getName(),

    version:
      app.getVersion(),

    electronVersion:
      process.versions.electron,

    nodeVersion:
      process.versions.node,

    platform:
      process.platform,

    arch:
      process.arch,
  };
}

function registerApplicationEvents():
  void {
  applicationState.subscribe(
    (snapshot) => {
      if (
        mainWindow === null ||
        mainWindow.isDestroyed()
      ) {
        return;
      }

      mainWindow.webContents.send(
        IPC_CHANNELS.applicationUpdate,
        snapshot,
      );
    },
  );
}

function resolveRendererPath():
  string {
  return fileURLToPath(
    new URL(
      './renderer/index.html',
      import.meta.url,
    ),
  );
}

function createMainWindow():
  void {
  const preloadPath =
    fileURLToPath(
      new URL(
        './preload.cjs',
        import.meta.url,
      ),
    );

  mainWindow =
    new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      show: false,

      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

  mainWindow.once(
    'ready-to-show',
    () => {
      mainWindow?.show();

      void applicationState.refresh();
    },
  );

  mainWindow.on(
    'closed',
    () => {
      mainWindow = null;
    },
  );

  void mainWindow.loadFile(
    resolveRendererPath(),
  );
}

let shuttingDown =
  false;

app.whenReady().then(
  async () => {
    registerApplicationEvents();

    registerIpcHandlers({
      applicationState,
      library,
      getAppInfo,
    });

    createMainWindow();

    applicationState.startPolling();

    await applicationState.refresh();

    app.on(
      'activate',
      () => {
        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          createMainWindow();
        }
      },
    );
  },
);

app.on(
  'before-quit',
  (event) => {
    if (
      shuttingDown
    ) {
      return;
    }

    shuttingDown = true;

    event.preventDefault();

    applicationState.stopPolling();

    void library
      .close()
      .finally(() => {
        app.quit();
      });
  },
);

app.on(
  'window-all-closed',
  () => {
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit();
    }
  },
);