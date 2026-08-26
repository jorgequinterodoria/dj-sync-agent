import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import { fileURLToPath } from 'node:url';
import {
  createDJSyncRuntime,
} from '../runtime/dj-sync-runtime.js';

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
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
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

          <style>
            :root {
              color-scheme: dark;

              font-family:
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;

              background: #111827;
              color: #f9fafb;
            }

            main {
              width:
                min(1100px, calc(100% - 48px));

              margin: 0 auto;
              padding: 48px 0;
            }

            h1 {
              margin: 0 0 8px;
              font-size: 32px;
            }

            h2 {
              margin-top: 0;
            }

            h3 {
              margin-bottom: 8px;
            }

            .subtitle {
              margin-top: 0;
              color: #9ca3af;
            }

            .card {
              margin-top: 24px;
              padding: 24px;

              border:
                1px solid #374151;

              border-radius: 14px;

              background: #1f2937;
            }

            .status-row {
              display: flex;
              align-items: center;
              gap: 12px;

              margin-bottom: 20px;
            }

            .status-value {
              font-size: 20px;
              font-weight: 700;
            }

            .actions {
              display: flex;
              gap: 12px;

              margin: 20px 0;
            }

            button {
              border: 0;
              border-radius: 8px;

              padding:
                10px 18px;

              font-size: 15px;
              font-weight: 600;

              cursor: pointer;
            }

            button:disabled {
              cursor: not-allowed;
              opacity: 0.45;
            }

            #start-runtime {
              background: #22c55e;
              color: #052e16;
            }

            #stop-runtime {
              background: #ef4444;
              color: #450a0a;
            }

            pre {
              overflow: auto;

              margin: 0;
              padding: 16px;

              border-radius: 8px;

              background: #111827;
              color: #d1d5db;

              font-size: 13px;
              line-height: 1.5;
            }

            #runtime-error {
              min-height: 20px;
              color: #f87171;
            }

            .grid {
              display: grid;

              grid-template-columns:
                repeat(2, minmax(0, 1fr));

              gap: 24px;
            }

            @media (max-width: 800px) {
              .grid {
                grid-template-columns: 1fr;
              }
            }
          </style>
        </head>

        <body>
          <main>
            <h1>DJ Sync Agent</h1>

            <p
              id="status"
              class="subtitle"
            >
              Connecting to Electron main process...
            </p>

            <section class="card">
              <h2>Sync Runtime</h2>

              <div class="status-row">
                <span>Status:</span>

                <strong
                  id="runtime-status"
                  class="status-value"
                >
                  stopped
                </strong>
              </div>

              <p id="runtime-error"></p>

              <div class="actions">
                <button id="start-runtime">
                  Start Sync
                </button>

                <button id="stop-runtime">
                  Stop Sync
                </button>
              </div>

              <h3>Last Run</h3>

              <pre id="last-run">
No sync run yet.
              </pre>
            </section>

            <div class="grid">
              <section class="card">
                <h2>Electron</h2>

                <pre id="app-info"></pre>
              </section>
            </div>
          </main>

          <script>
            const status =
              document.getElementById('status');

            const appInfo =
              document.getElementById('app-info');

            const runtimeStatus =
              document.getElementById(
                'runtime-status',
              );

            const runtimeError =
              document.getElementById(
                'runtime-error',
              );

            const lastRun =
              document.getElementById('last-run');

            const startButton =
              document.getElementById(
                'start-runtime',
              );

            const stopButton =
              document.getElementById(
                'stop-runtime',
              );

            if (
              !window.djSync ||
              typeof window.djSync.getAppInfo !==
                'function'
            ) {
              status.textContent =
                'Electron preload API unavailable.';

              appInfo.textContent =
                'window.djSync is not available.';

              throw new Error(
                'Electron preload API unavailable.',
              );
            }

            function renderRuntime(snapshot) {
              runtimeStatus.textContent =
                snapshot.status;

              runtimeError.textContent =
                snapshot.lastError ?? '';

              startButton.disabled =
                snapshot.status === 'running' ||
                snapshot.status === 'starting';

              stopButton.disabled =
                snapshot.status === 'stopped' ||
                snapshot.status === 'stopping';

              if (snapshot.lastRun === null) {
                lastRun.textContent =
                  'No sync run yet.';

                return;
              }

              lastRun.textContent =
                JSON.stringify(
                  snapshot.lastRun,
                  null,
                  2,
                );
            }

            const unsubscribeRuntimeUpdates =
              window.djSync.runtimeOnUpdate(
                (snapshot) => {
                  renderRuntime(snapshot);
                },
              );

            window.addEventListener(
              'beforeunload',
              () => {
                unsubscribeRuntimeUpdates();
              },
              { once: true },
            );

            window.djSync
              .getAppInfo()
              .then((info) => {
                status.textContent =
                  'IPC connection established.';

                appInfo.textContent =
                  JSON.stringify(
                    info,
                    null,
                    2,
                  );
              })
              .catch((error) => {
                status.textContent =
                  'IPC connection failed.';

                appInfo.textContent =
                  String(error);
              });

            window.djSync
              .runtimeStatus()
              .then(renderRuntime)
              .catch((error) => {
                runtimeError.textContent =
                  String(error);
              });

            startButton.addEventListener(
              'click',
              async () => {
                startButton.disabled = true;

                try {
                  const snapshot =
                    await window.djSync.runtimeStart();

                  renderRuntime(snapshot);
                } catch (error) {
                  runtimeError.textContent =
                    error instanceof Error
                      ? error.message
                      : String(error);

                  const snapshot =
                    await window.djSync.runtimeStatus();

                  renderRuntime(snapshot);
                }
              },
            );

            stopButton.addEventListener(
              'click',
              async () => {
                stopButton.disabled = true;

                try {
                  const snapshot =
                    await window.djSync.runtimeStop();

                  renderRuntime(snapshot);
                } catch (error) {
                  runtimeError.textContent =
                    error instanceof Error
                      ? error.message
                      : String(error);

                  const snapshot =
                    await window.djSync.runtimeStatus();

                  renderRuntime(snapshot);
                }
              },
            );
          </script>
        </body>
      </html>
    `)}`,
  );
}

app.whenReady().then(() => {
  registerRuntimeEvents();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (
      BrowserWindow.getAllWindows().length === 0
    ) {
      createMainWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (runtime.status().status === 'stopped') {
    return;
  }

  event.preventDefault();

  void runtime
    .stop()
    .catch(() => {
      // Preserve the shutdown path even if cleanup fails.
    })
    .finally(() => {
      app.exit(0);
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});