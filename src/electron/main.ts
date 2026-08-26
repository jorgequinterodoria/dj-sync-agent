import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import { fileURLToPath } from 'node:url';

import {
  createDJSyncService,
} from '../runtime/dj-sync-service.js';

import {
  createDJSyncApplicationState,
} from '../runtime/dj-sync-application-state.js';

let mainWindow:
  | BrowserWindow
  | null =
  null;

const service =
  createDJSyncService();

const applicationState =
  createDJSyncApplicationState(
    service,
  );

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

function publishApplicationSnapshot():
  void {
  if (
    mainWindow === null ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  mainWindow.webContents.send(
    'application:update',
    applicationState.snapshot(),
  );
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
        'application:update',
        snapshot,
      );
    },
  );
}

function registerIpcHandlers():
  void {
  ipcMain.handle(
    'app:get-info',
    (): AppInfo => ({
      name: app.getName(),
      version: app.getVersion(),
      electronVersion:
        process.versions.electron,
      nodeVersion:
        process.versions.node,
      platform:
        process.platform,
      arch:
        process.arch,
    }),
  );

  ipcMain.handle(
    'application:status',
    async () => {
      return applicationState.refresh();
    },
  );

  ipcMain.handle(
    'service:start',
    async () => {
      return applicationState.start();
    },
  );

  ipcMain.handle(
    'service:stop',
    async () => {
      return applicationState.stop();
    },
  );

  ipcMain.handle(
    'service:restart',
    async () => {
      return applicationState.restart();
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

function startApplicationState():
  void {
  applicationState.startPolling();
}

function stopApplicationState():
  void {
  applicationState.stopPolling();
}

let shuttingDown =
  false;

app.whenReady().then(
  async () => {
    registerApplicationEvents();
    registerIpcHandlers();
    createMainWindow();
    startApplicationState();

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

    stopApplicationState();

    app.quit();
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