import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import { fileURLToPath } from 'node:url';
import { createDJSyncRuntime } from '../runtime/dj-sync-runtime.js';

let mainWindow: BrowserWindow | null = null;

const runtime = createDJSyncRuntime();

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

function registerRuntimeEvents(): void {
  runtime.subscribe((snapshot) => {
    if (
      mainWindow === null ||
      mainWindow.isDestroyed()
    ) {
      return;
    }

    mainWindow.webContents.send(
      'runtime:update',
      snapshot,
    );
  });
}

function registerIpcHandlers(): void {
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
    'runtime:start',
    async () => {
      return runtime.start();
    },
  );

  ipcMain.handle(
    'runtime:stop',
    async () => {
      return runtime.stop();
    },
  );

  ipcMain.handle(
    'runtime:status',
    () => {
      return runtime.status();
    },
  );
}

function resolveRendererPath(): string {
  return fileURLToPath(
    new URL(
      './renderer/index.html',
      import.meta.url,
    ),
  );
}

function createMainWindow(): void {
  const preloadPath = fileURLToPath(
    new URL(
      './preload.cjs',
      import.meta.url,
    ),
  );

  mainWindow = new BrowserWindow({
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

async function shutdown(): Promise<void> {
  try {
    await runtime.stop();
  } catch {
    // Preserve application shutdown.
  }
}

let shuttingDown = false;

app.whenReady().then(() => {
  registerRuntimeEvents();
  registerIpcHandlers();
  createMainWindow();

  app.on(
    'activate',
    () => {
      if (
        BrowserWindow.getAllWindows()
          .length === 0
      ) {
        createMainWindow();
      }
    },
  );
});

app.on(
  'before-quit',
  (event) => {
    if (shuttingDown) {
      return;
    }

    if (
      runtime.status().status ===
      'stopped'
    ) {
      return;
    }

    shuttingDown = true;
    event.preventDefault();

    void shutdown().finally(() => {
      app.quit();
    });
  },
);

app.on(
  'window-all-closed',
  () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  },
);