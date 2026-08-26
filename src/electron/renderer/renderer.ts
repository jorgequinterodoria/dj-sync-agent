import type {
  DJSyncApplicationSnapshot,
} from '../ipc/contracts.js';

const connectionStatus =
  document.querySelector<HTMLElement>(
    '#connection-status',
  );

const serviceState =
  document.querySelector<HTMLElement>(
    '#service-state',
  );

const serviceDetail =
  document.querySelector<HTMLElement>(
    '#service-detail',
  );

const databaseState =
  document.querySelector<HTMLElement>(
    '#database-state',
  );

const databaseDetail =
  document.querySelector<HTMLElement>(
    '#database-detail',
  );

const serverState =
  document.querySelector<HTMLElement>(
    '#server-state',
  );

const serverDetail =
  document.querySelector<HTMLElement>(
    '#server-detail',
  );

const syncState =
  document.querySelector<HTMLElement>(
    '#sync-state',
  );

const syncDetail =
  document.querySelector<HTMLElement>(
    '#sync-detail',
  );

const serviceLabel =
  document.querySelector<HTMLElement>(
    '#service-label',
  );

const serviceError =
  document.querySelector<HTMLElement>(
    '#service-error',
  );

const lastRun =
  document.querySelector<HTMLPreElement>(
    '#last-run',
  );

const cursor =
  document.querySelector<HTMLPreElement>(
    '#cursor',
  );

const appInfo =
  document.querySelector<HTMLPreElement>(
    '#app-info',
  );

const startButton =
  document.querySelector<HTMLButtonElement>(
    '#start-service',
  );

const restartButton =
  document.querySelector<HTMLButtonElement>(
    '#restart-service',
  );

const stopButton =
  document.querySelector<HTMLButtonElement>(
    '#stop-service',
  );

const refreshButton =
  document.querySelector<HTMLButtonElement>(
    '#refresh-service',
  );

function setText(
  element: HTMLElement | null,
  value: string,
): void {
  if (
    element !== null
  ) {
    element.textContent =
      value;
  }
}

function setError(
  message: string | null,
): void {
  setText(
    serviceError,
    message ?? '',
  );
}

function renderApplicationState(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  const service =
    snapshot.service;

  const database =
    service.database;

  const server =
    service.server;

  const sync =
    service.sync;

  setText(
    serviceState,
    service.service.state,
  );

  setText(
    serviceDetail,
    service.service.loaded
      ? service.service.pid !==
        null
        ? `PID ${service.service.pid}`
        : 'Loaded'
      : 'LaunchAgent not loaded',
  );

  setText(
    databaseState,
    database.exists
      ? 'Available'
      : 'Missing',
  );

  setText(
    databaseDetail,
    database.path,
  );

  setText(
    serverState,
    server.healthy
      ? 'Healthy'
      : server.configured
        ? 'Unhealthy'
        : 'Not configured',
  );

  setText(
    serverDetail,
    server.configured
      ? server.latencyMs !==
        null
        ? `${server.latencyMs} ms`
        : server.error ??
          'Checking health...'
      : 'API credentials unavailable',
  );

  setText(
    syncState,
    sync.status ??
      sync.mode ??
      'Idle',
  );

  setText(
    syncDetail,
    sync.lastRun !==
      null
      ? sync.lastRun.completed ===
        true
        ? 'Last run completed'
        : sync.lastRun.lastError ??
          'Last run incomplete'
      : 'No sync run recorded',
  );

  setText(
    serviceLabel,
    service.service.label,
  );

  if (
    lastRun !== null
  ) {
    lastRun.textContent =
      sync.lastRun ===
      null
        ? 'No sync run yet.'
        : JSON.stringify(
            sync.lastRun,
            null,
            2,
          );
  }

  if (
    cursor !== null
  ) {
    cursor.textContent =
      sync.cursor ===
      null
        ? 'No cursor available.'
        : JSON.stringify(
            sync.cursor,
            null,
            2,
          );
  }

  const running =
    service.service.state ===
    'running';

  const installed =
    service.service.loaded ||
    service.service.state !==
      'unknown';

  if (
    startButton !==
    null
  ) {
    startButton.disabled =
      running;
  }

  if (
    stopButton !==
    null
  ) {
    stopButton.disabled =
      !running;
  }

  if (
    restartButton !==
    null
  ) {
    restartButton.disabled =
      !installed;
  }
}

async function refreshApplicationState():
  Promise<void> {
  setError(null);

  try {
    const snapshot =
      await window.djSync
        .application
        .refresh();

    renderApplicationState(
      snapshot,
    );

    setText(
      connectionStatus,
      'Connected to Electron main process',
    );
  } catch (error) {
    setText(
      connectionStatus,
      'Failed to connect to Electron main process',
    );

    setError(
      error instanceof Error
        ? error.message
        : String(error),
    );
  }
}

async function startService():
  Promise<void> {
  setError(null);

  try {
    const snapshot =
      await window.djSync
        .application
        .start();

    renderApplicationState(
      snapshot,
    );
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : String(error),
    );

    await refreshApplicationState();
  }
}

async function stopService():
  Promise<void> {
  setError(null);

  try {
    const snapshot =
      await window.djSync
        .application
        .stop();

    renderApplicationState(
      snapshot,
    );
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : String(error),
    );

    await refreshApplicationState();
  }
}

async function restartService():
  Promise<void> {
  setError(null);

  try {
    const snapshot =
      await window.djSync
        .application
        .restart();

    renderApplicationState(
      snapshot,
    );
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : String(error),
    );

    await refreshApplicationState();
  }
}

async function loadAppInfo():
  Promise<void> {
  if (
    appInfo === null
  ) {
    return;
  }

  try {
    const info =
      await window.djSync
        .app
        .getInfo();

    appInfo.textContent =
      JSON.stringify(
        info,
        null,
        2,
      );
  } catch (error) {
    appInfo.textContent =
      error instanceof Error
        ? error.message
        : String(error);
  }
}

function registerEvents():
  () => void {
  const unsubscribe =
    window.djSync
      .application
      .subscribe(
        (snapshot) => {
          renderApplicationState(
            snapshot,
          );
        },
      );

  startButton?.addEventListener(
    'click',
    () => {
      void startService();
    },
  );

  stopButton?.addEventListener(
    'click',
    () => {
      void stopService();
    },
  );

  restartButton?.addEventListener(
    'click',
    () => {
      void restartService();
    },
  );

  refreshButton?.addEventListener(
    'click',
    () => {
      void refreshApplicationState();
    },
  );

  return unsubscribe;
}

async function initialize():
  Promise<void> {
  const unsubscribe =
    registerEvents();

  window.addEventListener(
    'beforeunload',
    () => {
      unsubscribe();
    },
    { once: true },
  );

  await Promise.all([
    loadAppInfo(),
    refreshApplicationState(),
  ]);
}

void initialize().catch(
  (error) => {
    setError(
      error instanceof Error
        ? error.message
        : String(error),
    );
  },
);