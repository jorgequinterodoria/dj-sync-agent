import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import { fileURLToPath } from 'node:url';

let mainWindow: BrowserWindow | null = null;

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    'app:get-info',
    (): AppInfo => ({
      name: app.getName(),
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    }),
  );
}

function createMainWindow(): void {
  const preloadPath = fileURLToPath(
    new URL('./preload.cjs', import.meta.url),
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>DJ Sync Agent</title>
        </head>
        <body>
          <main>
            <h1>DJ Sync Agent</h1>

            <p id="status">
              Connecting to Electron main process...
            </p>

            <pre id="app-info"></pre>
          </main>

          <script>
            const status =
              document.getElementById('status');

            const appInfo =
              document.getElementById('app-info');

            if (
              !window.djSync ||
              typeof window.djSync.getAppInfo !== 'function'
            ) {
              status.textContent =
                'Electron preload API unavailable.';

              appInfo.textContent =
                'window.djSync is not available.';

              throw new Error(
                'Electron preload API unavailable.',
              );
            }

            window.djSync
              .getAppInfo()
              .then((info) => {
                status.textContent =
                  'IPC connection established.';

                appInfo.textContent =
                  JSON.stringify(info, null, 2);
              })
              .catch((error) => {
                status.textContent =
                  'IPC connection failed.';

                appInfo.textContent =
                  String(error);
              });
          </script>
        </body>
      </html>
    `)}`,
  );
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});