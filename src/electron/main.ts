import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import { fileURLToPath } from 'node:url';
import { createDJSyncService } from '../runtime/dj-sync-service.js';

let mainWindow: BrowserWindow | null = null;

const service =
  createDJSyncService();

let statusTimer:
  ReturnType<typeof setInterval> | null =
  null;

let statusRefreshInFlight =
  false;

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

async function publishServiceStatus(): Promise<void> {
  if (
    mainWindow === null ||
    mainWindow.isDestroyed() ||
    statusRefreshInFlight
  ) {
    return;
  }

  statusRefreshInFlight = true;

  try {
    const snapshot =
      await service.status();

    if (
      mainWindow !== null &&
      !mainWindow.isDestroyed()
    ) {
      mainWindow.webContents.send(
        'service:update',
        snapshot,
      );
    }
  } finally {
    statusRefreshInFlight =
      false;
  }
}

function startStatusPolling(): void {
  if (
    statusTimer !== null
  ) {
    return;
  }

  statusTimer =
    setInterval(() => {
      void publishServiceStatus();
    }, 5000);
}

function stopStatusPolling(): void {
  if (
    statusTimer === null
  ) {
    return;
  }

  clearInterval(
    statusTimer,
  );

  statusTimer = null;
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
    'service:status',
    async () => {
      return service.status();
    },
  );

  ipcMain.handle(
    'service:start',
    async () => {
      const snapshot =
        await service.start();

      void publishServiceStatus();

      return snapshot;
    },
  );

  ipcMain.handle(
    'service:stop',
    async () => {
      const snapshot =
        await service.stop();

      void publishServiceStatus();

      return snapshot;
    },
  );

  ipcMain.handle(
    'service:restart',
    async () => {
      const snapshot =
        await service.restart();

      void publishServiceStatus();

      return snapshot;
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

      void publishServiceStatus();
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
  stopStatusPolling();
}

let shuttingDown =
  false;

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();
  startStatusPolling();

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

    shuttingDown = true;

    event.preventDefault();

    void shutdown()
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