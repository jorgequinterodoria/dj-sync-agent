import type {
  DJSyncApplicationSnapshot,
} from '../ipc/contracts.js';

type CardStatus =
  | 'success'
  | 'warning'
  | 'danger'
  | 'unknown';

const connectionStatus =
  document.querySelector<HTMLElement>(
    '#connection-status',
  );

const connectionPill =
  document.querySelector<HTMLElement>(
    '#connection-pill',
  );

const refreshButton =
  document.querySelector<HTMLButtonElement>(
    '#refresh-service',
  );

const serviceCard =
  document.querySelector<HTMLElement>(
    '#service-card',
  );

const databaseCard =
  document.querySelector<HTMLElement>(
    '#database-card',
  );

const serverCard =
  document.querySelector<HTMLElement>(
    '#server-card',
  );

const syncCard =
  document.querySelector<HTMLElement>(
    '#sync-card',
  );

const serviceBadge =
  document.querySelector<HTMLElement>(
    '#service-badge',
  );

const databaseBadge =
  document.querySelector<HTMLElement>(
    '#database-badge',
  );

const serverBadge =
  document.querySelector<HTMLElement>(
    '#server-badge',
  );

const syncBadge =
  document.querySelector<HTMLElement>(
    '#sync-badge',
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

const servicePid =
  document.querySelector<HTMLElement>(
    '#service-pid',
  );

const serviceControlState =
  document.querySelector<HTMLElement>(
    '#service-control-state',
  );

const serviceLoaded =
  document.querySelector<HTMLElement>(
    '#service-loaded',
  );

const serviceDatabase =
  document.querySelector<HTMLElement>(
    '#service-database',
  );

const serviceUpdated =
  document.querySelector<HTMLElement>(
    '#service-updated',
  );

const serviceError =
  document.querySelector<HTMLElement>(
    '#service-error',
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

const lastRunState =
  document.querySelector<HTMLElement>(
    '#last-run-state',
  );

const lastRunProcessed =
  document.querySelector<HTMLElement>(
    '#last-run-processed',
  );

const lastRunBatches =
  document.querySelector<HTMLElement>(
    '#last-run-batches',
  );

const lastRunDuration =
  document.querySelector<HTMLElement>(
    '#last-run-duration',
  );

const lastRunStarted =
  document.querySelector<HTMLElement>(
    '#last-run-started',
  );

const lastRunFinished =
  document.querySelector<HTMLElement>(
    '#last-run-finished',
  );

const lastRunError =
  document.querySelector<HTMLElement>(
    '#last-run-error',
  );

const cursorUsn =
  document.querySelector<HTMLElement>(
    '#cursor-usn',
  );

const cursorId =
  document.querySelector<HTMLElement>(
    '#cursor-id',
  );

const cursorMode =
  document.querySelector<HTMLElement>(
    '#cursor-mode',
  );

const cursorSession =
  document.querySelector<HTMLElement>(
    '#cursor-session',
  );

const activityList =
  document.querySelector<HTMLElement>(
    '#activity-list',
  );

const appElectron =
  document.querySelector<HTMLElement>(
    '#app-electron',
  );

const appNode =
  document.querySelector<HTMLElement>(
    '#app-node',
  );

const appPlatform =
  document.querySelector<HTMLElement>(
    '#app-platform',
  );

const appArch =
  document.querySelector<HTMLElement>(
    '#app-arch',
  );

const appVersion =
  document.querySelector<HTMLElement>(
    '#app-version',
  );

const appDatabase =
  document.querySelector<HTMLElement>(
    '#app-database',
  );

function setText(
  element: HTMLElement | null,
  value: string,
): void {
  if (element !== null) {
    element.textContent =
      value;
  }
}

function setCardStatus(
  element: HTMLElement | null,
  status: CardStatus,
): void {
  if (element === null) {
    return;
  }

  element.dataset.status =
    status;
}

function setBadge(
  element: HTMLElement | null,
  label: string,
  status: CardStatus,
): void {
  if (element === null) {
    return;
  }

  element.textContent =
    label;

  element.className =
    `state-badge state-${status}`;
}

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    'en-US',
  ).format(value);
}

function formatDuration(
  elapsedMs: number | null,
): string {
  if (
    elapsedMs === null
  ) {
    return '—';
  }

  if (
    elapsedMs < 1000
  ) {
    return `${elapsedMs} ms`;
  }

  const totalSeconds =
    elapsedMs / 1000;

  if (
    totalSeconds < 60
  ) {
    return `${totalSeconds.toFixed(1)} s`;
  }

  const minutes =
    Math.floor(
      totalSeconds / 60,
    );

  const seconds =
    Math.round(
      totalSeconds % 60,
    );

  return `${minutes}m ${seconds}s`;
}

function formatDate(
  value: string | null,
): string {
  if (
    value === null
  ) {
    return '—';
  }

  const timestamp =
    new Date(value);

  if (
    Number.isNaN(
      timestamp.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(timestamp);
}

function formatRelativeDate(
  value: string | null,
): string {
  if (
    value === null
  ) {
    return '—';
  }

  const timestamp =
    new Date(value);

  if (
    Number.isNaN(
      timestamp.getTime(),
    )
  ) {
    return value;
  }

  const difference =
    Date.now() -
    timestamp.getTime();

  const seconds =
    Math.max(
      0,
      Math.round(
        difference / 1000,
      ),
    );

  if (
    seconds < 60
  ) {
    return `${seconds}s ago`;
  }

  const minutes =
    Math.round(
      seconds / 60,
    );

  if (
    minutes < 60
  ) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.round(
      minutes / 60,
    );

  if (
    hours < 24
  ) {
    return `${hours}h ago`;
  }

  return formatDate(value);
}

function statusLabel(
  value: string,
): string {
  if (!value) {
    return 'Unknown';
  }

  return value
    .charAt(0)
    .toUpperCase()
    + value.slice(1);
}

function renderConnection(
  connected: boolean,
): void {
  setText(
    connectionStatus,
    connected
      ? 'Connected'
      : 'Disconnected',
  );

  if (connectionPill !== null) {
    connectionPill.className =
      connected
        ? 'connection-pill connection-success'
        : 'connection-pill connection-danger';
  }
}

function renderService(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  const status =
    snapshot.service.service;

  let cardStatus:
    CardStatus =
      'unknown';

  if (
    status.state ===
    'running'
  ) {
    cardStatus =
      'success';
  } else if (
    status.state ===
    'stopped'
  ) {
    cardStatus =
      'warning';
  } else if (
    status.state ===
    'unknown'
  ) {
    cardStatus =
      'unknown';
  }

  setCardStatus(
    serviceCard,
    cardStatus,
  );

  setBadge(
    serviceBadge,
    statusLabel(
      status.state,
    ),
    cardStatus,
  );

  setText(
    serviceState,
    statusLabel(
      status.state,
    ),
  );

  setText(
    serviceDetail,
    status.loaded
      ? status.pid !== null
        ? `PID ${formatNumber(
            status.pid,
          )}`
        : 'LaunchAgent loaded'
      : 'LaunchAgent not loaded',
  );

  setText(
    serviceLabel,
    status.label,
  );

  setText(
    servicePid,
    status.pid !== null
      ? `PID ${formatNumber(
          status.pid,
        )}`
      : 'PID —',
  );

  setText(
    serviceControlState,
    statusLabel(
      status.state,
    ),
  );

  setText(
    serviceLoaded,
    status.loaded
      ? 'Yes'
      : 'No',
  );

  setText(
    serviceDatabase,
    snapshot.service.database.exists
      ? 'Available'
      : 'Missing',
  );

  setText(
    serviceUpdated,
    formatRelativeDate(
      snapshot.generatedAt,
    ),
  );

  const running =
    status.state ===
    'running';

  const installed =
    status.loaded ||
    status.state !==
      'unknown';

  if (
    startButton !== null
  ) {
    startButton.disabled =
      running;
  }

  if (
    stopButton !== null
  ) {
    stopButton.disabled =
      !running;
  }

  if (
    restartButton !== null
  ) {
    restartButton.disabled =
      !installed;
  }
}

function renderDatabase(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  const database =
    snapshot.service.database;

  const status:
    CardStatus =
    database.exists
      ? 'success'
      : 'danger';

  setCardStatus(
    databaseCard,
    status,
  );

  setBadge(
    databaseBadge,
    database.exists
      ? 'Ready'
      : 'Missing',
    status,
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
}

function renderServer(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  const server =
    snapshot.service.server;

  let status:
    CardStatus =
      'unknown';

  let label =
    'Unknown';

  if (
    server.healthy
  ) {
    status =
      'success';

    label =
      'Healthy';
  } else if (
    server.configured
  ) {
    status =
      'danger';

    label =
      'Unhealthy';
  } else {
    status =
      'warning';

    label =
      'Not configured';
  }

  setCardStatus(
    serverCard,
    status,
  );

  setBadge(
    serverBadge,
    label,
    status,
  );

  setText(
    serverState,
    label,
  );

  setText(
    serverDetail,
    server.latencyMs !== null
      ? `${server.latencyMs} ms`
      : server.error ??
        'Waiting for health check',
  );
}

function renderSync(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  const sync =
    snapshot.service.sync;

  let status:
    CardStatus =
      'unknown';

  let label =
    statusLabel(
      sync.status ??
        sync.mode ??
        'idle',
    );

  if (
    sync.status ===
    'completed'
  ) {
    status =
      'success';

    label =
      'Completed';
  } else if (
    sync.status ===
    'running'
  ) {
    status =
      'warning';

    label =
      'Running';
  } else if (
    sync.status ===
    'failed'
  ) {
    status =
      'danger';

    label =
      'Failed';
  } else if (
    sync.status ===
    'paused'
  ) {
    status =
      'warning';

    label =
      'Paused';
  }

  setCardStatus(
    syncCard,
    status,
  );

  setBadge(
    syncBadge,
    label,
    status,
  );

  setText(
    syncState,
    label,
  );

  setText(
    syncDetail,
    sync.lastRun !== null
      ? sync.lastRun.completed ===
        true
        ? `${formatNumber(
            sync.lastRun.processed,
          )} items processed`
        : sync.lastRun.lastError ??
          'Last run incomplete'
      : 'No sync run recorded',
  );

  if (
    lastRunState !== null
  ) {
    const lastRun =
      sync.lastRun;

    if (
      lastRun === null
    ) {
      setBadge(
        lastRunState,
        'No data',
        'unknown',
      );
    } else if (
      lastRun.completed
    ) {
      setBadge(
        lastRunState,
        'Completed',
        'success',
      );
    } else {
      setBadge(
        lastRunState,
        'Incomplete',
        'warning',
      );
    }
  }

  const lastRun =
    sync.lastRun;

  setText(
    lastRunProcessed,
    lastRun !== null
      ? formatNumber(
          lastRun.processed,
        )
      : '—',
  );

  setText(
    lastRunBatches,
    lastRun !== null
      ? formatNumber(
          lastRun.batchesProcessed,
        )
      : '—',
  );

  setText(
    lastRunDuration,
    lastRun !== null
      ? formatDuration(
          lastRun.elapsedMs,
        )
      : '—',
  );

  setText(
    lastRunStarted,
    lastRun !== null
      ? formatDate(
          lastRun.startedAt,
        )
      : '—',
  );

  setText(
    lastRunFinished,
    lastRun !== null
      ? formatDate(
          lastRun.finishedAt,
        )
      : '—',
  );

  setText(
    lastRunError,
    lastRun?.lastError ??
      '',
  );
}

function renderCursor(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  const sync =
    snapshot.service.sync;

  setText(
    cursorUsn,
    sync.cursor !== null
      ? formatNumber(
          sync.cursor.rbLocalUsn,
        )
      : '—',
  );

  setText(
    cursorId,
    sync.cursor?.id ??
      '—',
  );

  setText(
    cursorMode,
    statusLabel(
      sync.mode ??
        'idle',
    ),
  );

  setText(
    cursorSession,
    sync.sessionId ??
      '—',
  );
}

function renderActivity(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  if (
    activityList === null
  ) {
    return;
  }

  const service =
    snapshot.service.service;

  const database =
    snapshot.service.database;

  const server =
    snapshot.service.server;

  const sync =
    snapshot.service.sync;

  const activities: Array<{
    title: string;
    detail: string;
    status: CardStatus;
  }> = [];

  if (
    sync.lastRun !== null
  ) {
    activities.push({
      title:
        sync.lastRun.completed
          ? 'Sync completed'
          : 'Sync incomplete',
      detail:
        `${formatNumber(
          sync.lastRun.processed,
        )} items processed · ${formatDuration(
          sync.lastRun.elapsedMs,
        )}`,
      status:
        sync.lastRun.completed
          ? 'success'
          : 'warning',
    });
  }

  activities.push({
    title:
      server.healthy
        ? 'Server healthy'
        : server.configured
          ? 'Server unhealthy'
          : 'Server not configured',
    detail:
      server.latencyMs !== null
        ? `${server.latencyMs} ms response time`
        : server.error ??
          'Health status unavailable',
    status:
      server.healthy
        ? 'success'
        : server.configured
          ? 'danger'
          : 'warning',
  });

  activities.push({
    title:
      database.exists
        ? 'Database available'
        : 'Database missing',
    detail:
      database.path,
    status:
      database.exists
        ? 'success'
        : 'danger',
  });

  activities.push({
    title:
      service.state ===
      'running'
        ? 'Service running'
        : service.state ===
            'stopped'
          ? 'Service stopped'
          : 'Service state unknown',
    detail:
      service.pid !== null
        ? `PID ${service.pid}`
        : service.label,
    status:
      service.state ===
      'running'
        ? 'success'
        : service.state ===
            'stopped'
          ? 'warning'
          : 'unknown',
  });

  activityList.innerHTML =
    activities
      .slice(0, 4)
      .map(
        (activity) => `
          <div class="activity-item">
            <span
              class="activity-dot activity-${activity.status}"
            ></span>

            <div class="activity-content">
              <strong>
                ${escapeHtml(
                  activity.title,
                )}
              </strong>

              <span>
                ${escapeHtml(
                  activity.detail,
                )}
              </span>
            </div>
          </div>
        `,
      )
      .join('');
}

function escapeHtml(
  value: string,
): string {
  return value
    .replaceAll(
      '&',
      '&amp;',
    )
    .replaceAll(
      '<',
      '&lt;',
    )
    .replaceAll(
      '>',
      '&gt;',
    )
    .replaceAll(
      '"',
      '&quot;',
    )
    .replaceAll(
      "'",
      '&#039;',
    );
}

function renderAppInfo(
  info: Awaited<
    ReturnType<
      typeof window.djSync.app.getInfo
    >
  >,
): void {
  setText(
    appElectron,
    info.electronVersion,
  );

  setText(
    appNode,
    info.nodeVersion,
  );

  setText(
    appPlatform,
    info.platform,
  );

  setText(
    appArch,
    info.arch,
  );

  setText(
    appVersion,
    info.version,
  );

  setText(
    appDatabase,
    'Rekordbox',
  );
}

function renderApplicationState(
  snapshot:
    DJSyncApplicationSnapshot,
): void {
  renderService(
    snapshot,
  );

  renderDatabase(
    snapshot,
  );

  renderServer(
    snapshot,
  );

  renderSync(
    snapshot,
  );

  renderCursor(
    snapshot,
  );

  renderActivity(
    snapshot,
  );

  setText(
    connectionStatus,
    'Connected',
  );
}

async function refreshApplicationState():
  Promise<void> {
  setError(
    '',
  );

  if (
    refreshButton !== null
  ) {
    refreshButton.disabled =
      true;
  }

  try {
    const snapshot =
      await window.djSync
        .application
        .refresh();

    renderApplicationState(
      snapshot,
    );

    renderConnection(
      true,
    );
  } catch (error) {
    renderConnection(
      false,
    );

    setError(
      error instanceof Error
        ? error.message
        : String(error),
    );
  } finally {
    if (
      refreshButton !== null
    ) {
      refreshButton.disabled =
        false;
    }
  }
}

function setError(
  message: string,
): void {
  setText(
    serviceError,
    message,
  );
}

async function startService():
  Promise<void> {
  setError('');

  try {
    const snapshot =
      await window.djSync
        .application
        .start();

    renderApplicationState(
      snapshot,
    );

    renderConnection(
      true,
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
  setError('');

  try {
    const snapshot =
      await window.djSync
        .application
        .stop();

    renderApplicationState(
      snapshot,
    );

    renderConnection(
      true,
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
  setError('');

  try {
    const snapshot =
      await window.djSync
        .application
        .restart();

    renderApplicationState(
      snapshot,
    );

    renderConnection(
      true,
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
  try {
    const info =
      await window.djSync
        .app
        .getInfo();

    renderAppInfo(
      info,
    );
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : String(error),
    );
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
    {
      once: true,
    },
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