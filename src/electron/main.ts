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
  readServiceEnvironment,
} from '../runtime/dj-sync-service.js';

import {
  createDJSyncApplicationState,
  type DJSyncApplicationState,
} from '../runtime/dj-sync-application-state.js';

import {
  createDJSyncRuntime,
  type DJSyncRuntime,
} from '../runtime/dj-sync-runtime.js';

import {
  createDJSyncJobRuntime,
} from '../runtime/dj-sync-job-runtime.js';

import {
  createRekordboxLibraryService,
} from '../runtime/rekordbox-library.js';

import {
  registerIpcHandlers,
} from './ipc/register.js';

import {
  registerCopilotUiIpc,
} from './ipc/copilot-ui-ipc.js';

import {
  createDJSyncCopilotUiService,
} from '../runtime/dj-sync-copilot-ui.js';

import {
  createDJSyncCopilotActionController,
} from '../runtime/dj-sync-copilot-action-controller.js';

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

const library =
  createRekordboxLibraryService(
    config,
  );

const copilotUi =
  createDJSyncCopilotUiService();

const copilotActions =
  createDJSyncCopilotActionController({
    executor: {
      async execute() {
        throw new Error(
          'Real DJ action execution is deferred to Phase 32.',
        );
      },
    },
  });

let runtime:
  | DJSyncRuntime
  | null =
  null;

let applicationState:
  | DJSyncApplicationState
  | null =
  null;

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

function registerApplicationEvents(): void {
  if (
    applicationState === null
  ) {
    return;
  }

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
      void applicationState?.refresh();
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

function resolveJobsApiUrl(
  serviceEnvironment: Awaited<
    ReturnType<typeof readServiceEnvironment>
  >,
): string | null {
  const explicit =
    config.INTELLIGENCE_JOBS_API_URL?.trim() ??
    process.env.INTELLIGENCE_JOBS_API_URL?.trim() ??
    '';

  if (explicit) {
    return explicit;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';

  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/intelligence-jobs`;
  }

  const serviceApiUrl =
    serviceEnvironment.apiUrl?.trim() ??
    '';

  if (serviceApiUrl) {
    if (/\/functions\/v1\/sync-(?:batches?|batch)\/?$/.test(serviceApiUrl)) {
      return serviceApiUrl.replace(
        /\/sync-(?:batches?|batch)\/?$/,
        '/intelligence-jobs',
      );
    }

    if (/\/functions\/v1\/sync\/batches\/?$/.test(serviceApiUrl)) {
      return serviceApiUrl.replace(
        /\/sync\/batches\/?$/,
        '/intelligence-jobs',
      );
    }
  }

  return null;
}

app.whenReady().then(
  async () => {
    const serviceEnvironment =
      await readServiceEnvironment();

    const apiUrl =
      resolveJobsApiUrl(
        serviceEnvironment,
      );

    const apiKey =
      process.env.SYNC_API_KEY?.trim() ??
      serviceEnvironment.apiKey?.trim() ??
      '';

    const deviceId =
      process.env.SYNC_AGENT_ID?.trim() ??
      serviceEnvironment.agentId?.trim() ??
      '';

    const jobRuntime =
      deviceId &&
      apiUrl &&
      apiKey
        ? createDJSyncJobRuntime({
            deviceId,
            apiUrl,
            apiKey,
          })
        : createDJSyncJobRuntime({
            deviceId:
              deviceId ||
              'electron-unconfigured',
            apiUrl: null,
            apiKey: null,
          });

    runtime =
      createDJSyncRuntime({
        jobRuntime,
      });

    applicationState =
      createDJSyncApplicationState(
        service,
        runtime,
      );

    registerApplicationEvents();

    registerIpcHandlers({
      applicationState,
      library,
      getAppInfo,
    });

    registerCopilotUiIpc({
      chat: copilotUi,
      actions: copilotActions,
    });

    createMainWindow();

    applicationState.startPolling();

    /*
     * Electron owns the runtime now. If the legacy LaunchAgent
     * is still loaded/running, stop it before starting the local
     * runtime so the Rekordbox watcher is not duplicated.
     */
    try {
      await service.stop();
    } catch {
      // Legacy service shutdown must not prevent Electron startup.
    }

    try {
      await applicationState.start();
    } catch (error) {
      console.error(
        `DJ Sync autonomous runtime failed to start: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }

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

let shuttingDown = false;

app.on(
  'before-quit',
  (event) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    event.preventDefault();

    applicationState?.stopPolling();

    void (async () => {
      try {
        await applicationState?.stop();
      } catch (error) {
        console.error(
          `DJ Sync autonomous runtime failed to stop cleanly: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }

      try {
        await runtime?.stop();
      } catch {
        // Application state normally owns the same runtime.
      }

      try {
        await library.close();
      } finally {
        app.quit();
      }
    })();
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
