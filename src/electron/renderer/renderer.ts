import type {
  DJSyncApplicationSnapshot,
  NormalizedTrack,
  LibraryPage,
  LibraryTrackSummary,
  SetIntelligenceResult,
} from '../ipc/contracts.js';

import { bindNewSidebarNav } from './production-ui-entry.js';
import type { RecommendationResult } from '../../recommendations/recommendation-types.js';
import {
  buildPhase62RecommendationContext,
  normalizePhase62Filters,
} from './phase62-ui.js';

type CardStatus =
  | 'success'
  | 'warning'
  | 'danger'
  | 'unknown';

type ViewName =
  | 'dashboard'
  | 'library';

let currentView:
  ViewName =
    'dashboard';

let libraryAfterId:
  string | null =
    null;

let librarySearch =
  '';

let libraryHasMore =
  true;

let libraryBusy =
  false;

let selectedTrackId:
  string | null =
    null;

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

const dashboardView =
  document.querySelector<HTMLElement>(
    '#view-dashboard',
  );

const libraryView =
  document.querySelector<HTMLElement>(
    '#view-library',
  );

const navDashboard =
  document.querySelector<HTMLButtonElement>(
    '#nav-dashboard',
  );

const navLibrary =
  document.querySelector<HTMLButtonElement>(
    '#nav-library',
  );

const librarySummary =
  document.querySelector<HTMLElement>(
    '#library-summary',
  );

const librarySearchInput =
  document.querySelector<HTMLInputElement>(
    '#library-search',
  );

const librarySearchClear =
  document.querySelector<HTMLButtonElement>(
    '#library-search-clear',
  );

const libraryLoading =
  document.querySelector<HTMLElement>(
    '#library-loading',
  );

const libraryEmpty =
  document.querySelector<HTMLElement>(
    '#library-empty',
  );

const libraryError =
  document.querySelector<HTMLElement>(
    '#library-error',
  );

const libraryTableBody =
  document.querySelector<HTMLTableSectionElement>(
    '#library-table-body',
  );

const libraryPageStatus =
  document.querySelector<HTMLElement>(
    '#library-page-status',
  );

const libraryLoadMore =
  document.querySelector<HTMLButtonElement>(
    '#library-load-more',
  );

const libraryDetail =
  document.querySelector<HTMLElement>(
    '#library-detail',
  );

const HAS_LEGACY_DASHBOARD =
  Boolean(
    serviceCard &&
      databaseCard &&
      serverCard &&
      syncCard,
  );

const HAS_LEGACY_ENVIRONMENT =
  Boolean(appVersion ?? appDatabase);

function setText(
  element:
    | HTMLElement
    | null,
  value: string,
): void {
  if (
    element !== null
  ) {
    element.textContent =
      value;
  }
}

function setCardStatus(
  element:
    | HTMLElement
    | null,
  status: CardStatus,
): void {
  if (
    element === null
  ) {
    return;
  }

  element.dataset.status =
    status;
}

function setBadge(
  element:
    | HTMLElement
    | null,
  label: string,
  status: CardStatus,
): void {
  if (
    element === null
  ) {
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
  value:
    | string
    | null,
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
  value:
    | string
    | null,
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

  return formatDate(
    value,
  );
}

function statusLabel(
  value: string,
): string {
  if (
    !value
  ) {
    return 'Unknown';
  }

  return (
    value
      .charAt(0)
      .toUpperCase() +
    value.slice(1)
  );
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

  if (
    connectionPill !== null
  ) {
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
  const runtime =
    snapshot.runtime;

  let cardStatus: CardStatus =
    'unknown';

  if (
    runtime.lastError !== null &&
    runtime.status === 'stopped'
  ) {
    cardStatus =
      'danger';
  } else if (
    runtime.status === 'running'
  ) {
    cardStatus =
      'success';
  } else if (
    runtime.status === 'starting' ||
    runtime.status === 'stopping'
  ) {
    cardStatus =
      'warning';
  } else if (
    runtime.status === 'stopped'
  ) {
    cardStatus =
      'warning';
  }

  setCardStatus(
    serviceCard,
    cardStatus,
  );

  setBadge(
    serviceBadge,
    statusLabel(
      runtime.status,
    ),
    cardStatus,
  );

  setText(
    serviceState,
    statusLabel(
      runtime.status,
    ),
  );

  const jobState =
    runtime.jobs.status;

  const jobDetail =
    runtime.jobs.lastRun !== null
      ? `Last cycle: ${formatNumber(
          runtime.jobs.lastRun.claimed,
        )} claimed · ${formatNumber(
          runtime.jobs.lastRun.completed,
        )} completed`
      : runtime.jobs.configured
        ? 'Worker configured · waiting for jobs'
        : 'Worker not configured';

  setText(
    serviceDetail,
    runtime.lastError ??
      `${statusLabel(jobState)} · ${jobDetail}`,
  );

  setText(
    serviceLabel,
    'Electron-owned autonomous runtime',
  );

  setText(
    servicePid,
    runtime.jobs.workerId !== null
      ? `Worker ${runtime.jobs.workerId.slice(-12)}`
      : 'Worker —',
  );

  setText(
    serviceControlState,
    statusLabel(
      runtime.status,
    ),
  );

  setText(
    serviceLoaded,
    runtime.jobs.configured
      ? 'Configured'
      : 'Disabled',
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

  const starting =
    runtime.status ===
    'starting';

  const running =
    runtime.status ===
    'running';

  const stopping =
    runtime.status ===
    'stopping';

  if (
    startButton !==
    null
  ) {
    startButton.disabled =
      running ||
      starting ||
      stopping;
  }

  if (
    stopButton !==
    null
  ) {
    stopButton.disabled =
      !running ||
      stopping;
  }

  if (
    restartButton !==
    null
  ) {
    restartButton.disabled =
      starting ||
      stopping;
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
    server.latencyMs !==
      null
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

  const lastRun =
    sync.lastRun;

  if (
    lastRunState !== null
  ) {
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

  const activities:
    Array<{
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

  const runtime =
    snapshot.runtime;

  activities.push({
    title:
      runtime.status === 'running'
        ? 'Agent runtime running'
        : runtime.status === 'stopped'
          ? 'Agent runtime stopped'
          : `Agent runtime ${runtime.status}`,

    detail:
      runtime.jobs.lastRun !== null
        ? `${formatNumber(
            runtime.jobs.lastRun.completed,
          )} jobs completed in last cycle`
        : runtime.jobs.configured
          ? 'Job worker configured'
          : 'Job worker not configured',

    status:
      runtime.status === 'running'
        ? 'success'
        : runtime.lastError !== null
          ? 'danger'
          : 'warning',
  });

  activityList.innerHTML =
    activities
      .slice(
        0,
        4,
      )
      .map(
        (
          activity,
        ) => `
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
  info:
    Awaited<
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
  if (!HAS_LEGACY_DASHBOARD) {
    setText(
      connectionStatus,
      'Connected',
    );
    return;
  }

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

function renderTrackRow(
  track:
    LibraryTrackSummary,
): string {
  return `
    <tr
      data-track-id="${escapeHtml(
        track.id,
      )}"
      class="track-row"
    >
      <td>
        <div class="track-title-cell">
          <strong>
            ${escapeHtml(
              track.title ??
                'Untitled',
            )}
          </strong>

          <span>
            ${escapeHtml(
              track.id,
            )}
          </span>
        </div>
      </td>

      <td>
        ${escapeHtml(
          track.artist ??
            '—',
        )}
      </td>

      <td>
        ${escapeHtml(
          track.album ??
            '—',
        )}
      </td>

      <td>
        ${
          track.bpm !== null
            ? track.bpm.toFixed(1)
            : '—'
        }
      </td>

      <td>
        ${escapeHtml(
          track.key ??
            '—',
        )}
      </td>

      <td>
        ${formatTrackLength(
          track.lengthSeconds,
        )}
      </td>

      <td>
        ${formatRating(
          track.rating,
        )}
      </td>

      <td>
        <button
          class="track-open-button"
          type="button"
          data-track-id="${escapeHtml(
            track.id,
          )}"
        >
          View
        </button>
      </td>
    </tr>
  `;
}

function formatTrackLength(
  seconds:
    | number
    | null,
): string {
  if (
    seconds === null ||
    seconds < 0
  ) {
    return '—';
  }

  const minutes =
    Math.floor(
      seconds / 60,
    );

  const remainder =
    Math.floor(
      seconds % 60,
    );

  return `${minutes}:${String(
    remainder,
  ).padStart(
    2,
    '0',
  )}`;
}

function formatRating(
  rating:
    | number
    | null,
): string {
  if (
    rating === null
  ) {
    return '—';
  }

  return `${rating}/5`;
}

function renderLibraryPage(
  page:
    LibraryPage,
  append:
    boolean,
): void {
  if (
    libraryTableBody ===
    null
  ) {
    return;
  }

  const rows =
    page.items
      .map(
        renderTrackRow,
      )
      .join('');

  if (
    append
  ) {
    libraryTableBody.insertAdjacentHTML(
      'beforeend',
      rows,
    );
  } else {
    libraryTableBody.innerHTML =
      rows;
  }

  libraryAfterId =
    page.nextAfterId;

  libraryHasMore =
    page.hasMore;

  setText(
    librarySummary,
    `${formatNumber(
      page.total,
    )} active tracks`,
  );

  const visibleCount =
    libraryTableBody
      .querySelectorAll(
        'tr',
      ).length;

  setText(
    libraryPageStatus,
    `${formatNumber(
      visibleCount,
    )} loaded of ${formatNumber(
      page.total,
    )}`,
  );

  if (
    libraryLoadMore !==
    null
  ) {
    libraryLoadMore.disabled =
      !page.hasMore ||
      libraryBusy;

    libraryLoadMore.textContent =
      page.hasMore
        ? 'Load more'
        : 'All loaded';
  }

  if (
    libraryLoading !==
    null
  ) {
    libraryLoading.classList.add(
      'view-hidden',
    );
  }

  if (
    libraryEmpty !==
    null
  ) {
    libraryEmpty.classList.toggle(
      'view-hidden',
      page.items.length !==
        0 ||
        append,
    );
  }
}

async function loadLibraryPage(
  append =
    false,
): Promise<void> {
  if (
    libraryBusy
  ) {
    return;
  }

  libraryBusy =
    true;

  setText(
    libraryError,
    '',
  );

  if (
    !append &&
    libraryLoading !== null
  ) {
    libraryLoading.classList.remove(
      'view-hidden',
    );
  }

  try {
    const page =
      await window.djSync
        .library
        .list({
          afterId:
            append
              ? libraryAfterId
              : null,

          limit:
            100,

          search:
            librarySearch,
        });

    renderLibraryPage(
      page,
      append,
    );
  } catch (error) {
    setText(
      libraryError,
      error instanceof Error
        ? error.message
        : String(error),
    );

    if (
      libraryLoading !==
      null
    ) {
      libraryLoading.classList.add(
        'view-hidden',
      );
    }
  } finally {
    libraryBusy =
      false;

    if (
      libraryLoadMore !==
      null
    ) {
      libraryLoadMore.disabled =
        !libraryHasMore;
    }
  }
}

function renderTrackDetail(
  track:
    NormalizedTrack,
): void {
  if (
    libraryDetail ===
    null
  ) {
    return;
  }

  const file =
    track.primaryFile;

  const metadata =
    track.metadata;

  const technical =
    track.technical;

  const sync =
    track.sync;

  selectedTrackId =
    track.identity.id;

  window.dispatchEvent(
    new CustomEvent(
      'dj-sync:track-selected',
      {
        detail: track,
      },
    ),
  );

  libraryDetail.innerHTML =
    `
      <div class="panel-header">
        <div>
          <div class="eyebrow">
            TRACK
          </div>

          <h2>
            ${escapeHtml(
              metadata.title ??
                'Untitled',
            )}
          </h2>

          <p class="panel-subtitle">
            ${escapeHtml(
              metadata.artist ??
                'Unknown artist',
            )}
          </p>
        </div>

        <span class="state-badge state-success">
          ${technical.analyzed
            ? 'Analyzed'
            : 'Unanalyzed'}
        </span>
      </div>

      <div class="track-detail-grid">
        ${detailField(
          'Rekordbox ID',
          track.identity.id,
        )}

        ${detailField(
          'Artist',
          metadata.artist,
        )}

        ${detailField(
          'Album',
          metadata.album,
        )}

        ${detailField(
          'Genre',
          metadata.genre,
        )}

        ${detailField(
          'Label',
          metadata.label,
        )}

        ${detailField(
          'Key',
          metadata.key,
        )}

        ${detailField(
          'Remixer',
          metadata.remixer,
        )}

        ${detailField(
          'Composer',
          metadata.composer,
        )}

        ${detailField(
          'BPM',
          technical.bpm !== null
            ? technical.bpm.toFixed(
                2,
              )
            : null,
        )}

        ${detailField(
          'Duration',
          formatTrackLength(
            technical.lengthSeconds,
          ),
        )}

        ${detailField(
          'Bitrate',
          technical.bitrate !==
            null
            ? `${technical.bitrate} bps`
            : null,
        )}

        ${detailField(
          'Sample rate',
          technical.sampleRate !==
            null
            ? `${technical.sampleRate} Hz`
            : null,
        )}

        ${detailField(
          'Rating',
          technical.rating !==
            null
            ? `${technical.rating}/5`
            : null,
        )}

        ${detailField(
          'Play count',
          technical.playCount !==
            null
            ? formatNumber(
                technical.playCount,
              )
            : null,
        )}

        ${detailField(
          'RB Local USN',
          sync.rbLocalUsn !==
            null
            ? formatNumber(
                sync.rbLocalUsn,
              )
            : null,
        )}

        ${detailField(
          'Updated',
          sync.updatedAt,
        )}
      </div>

      <div class="detail-block">
        <span class="detail-label">
          File
        </span>

        <code class="path-value">
          ${escapeHtml(
            file.localPath ??
              file.path ??
              'No file path',
          )}
        </code>
      </div>

      <div class="detail-block">
        <span class="detail-label">
          Playlists
        </span>

        ${
          track.playlists.length ===
          0
            ? '<span class="muted">No playlists</span>'
            : `
              <div class="playlist-list">
                ${track.playlists
                  .map(
                    (
                      playlist,
                    ) => `
                      <span class="playlist-chip">
                        ${escapeHtml(
                          playlist.playlistName ??
                            playlist.playlistId,
                        )}
                      </span>
                    `,
                  )
                  .join('')}
              </div>
            `
        }
      </div>

      <div class="detail-block">
        <span class="detail-label">
          Cues
        </span>

        <strong>
          ${formatNumber(
            track.cues.length,
          )}
        </strong>
      </div>
    `;
}

function detailField(
  label: string,
  value:
    | string
    | number
    | null,
): string {
  return `
    <div class="detail-field">
      <span>
        ${escapeHtml(
          label,
        )}
      </span>

      <strong>
        ${escapeHtml(
          value === null
            ? '—'
            : String(value),
        )}
      </strong>
    </div>
  `;
}

async function openTrack(
  trackId: string,
): Promise<void> {
  if (
    libraryDetail ===
    null
  ) {
    return;
  }

  libraryDetail.innerHTML =
    `
      <div class="empty-state">
        Loading track...
      </div>
    `;

  try {
    const track =
      await window.djSync
        .library
        .get(trackId);

    renderTrackDetail(
      track,
    );
  } catch (error) {
    libraryDetail.innerHTML =
      `
        <div class="empty-state library-detail-error">
          ${escapeHtml(
            error instanceof Error
              ? error.message
              : String(error),
          )}
        </div>
      `;
  }
}

function setView(
  view: ViewName,
): void {
  currentView =
    view;

  dashboardView?.classList.toggle(
    'view-hidden',
    view !==
      'dashboard',
  );

  libraryView?.classList.toggle(
    'view-hidden',
    view !==
      'library',
  );

  navDashboard?.classList.toggle(
    'nav-active',
    view ===
      'dashboard',
  );

  navLibrary?.classList.toggle(
    'nav-active',
    view ===
      'library',
  );

  if (
    view ===
    'library'
  ) {
    if (
      libraryTableBody !==
        null &&
      libraryTableBody
        .children.length ===
        0
    ) {
      void loadLibraryPage(
        false,
      );
    }
  }
}

function clearLibrarySearch():
  void {
  librarySearch =
    '';

  libraryAfterId =
    null;

  if (
    librarySearchInput !==
    null
  ) {
    librarySearchInput.value =
      '';
  }

  void loadLibraryPage(
    false,
  );
}

async function refreshApplicationState():
  Promise<void> {
  setText(
    serviceError,
    '',
  );

  if (
    refreshButton !==
    null
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

    setText(
      serviceError,
      error instanceof Error
        ? error.message
        : String(error),
    );
  } finally {
    if (
      refreshButton !==
      null
    ) {
      refreshButton.disabled =
        false;
    }
  }
}

async function startService():
  Promise<void> {
  setText(
    serviceError,
    '',
  );

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
    setText(
      serviceError,
      error instanceof Error
        ? error.message
        : String(error),
    );

    await refreshApplicationState();
  }
}

async function stopService():
  Promise<void> {
  setText(
    serviceError,
    '',
  );

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
    setText(
      serviceError,
      error instanceof Error
        ? error.message
        : String(error),
    );

    await refreshApplicationState();
  }
}

async function restartService():
  Promise<void> {
  setText(
    serviceError,
    '',
  );

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
    setText(
      serviceError,
      error instanceof Error
        ? error.message
        : String(error),
    );

    await refreshApplicationState();
  }
}

async function loadAppInfo():
  Promise<void> {
  if (!HAS_LEGACY_ENVIRONMENT) {
    return;
  }

  try {
    const info =
      await window.djSync
        .app
        .getInfo();

    renderAppInfo(
      info,
    );
  } catch (error) {
    setText(
      serviceError,
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

  navDashboard?.addEventListener(
    'click',
    () => {
      setView(
        'dashboard',
      );
    },
  );

  navLibrary?.addEventListener(
    'click',
    () => {
      setView(
        'library',
      );
    },
  );

  libraryLoadMore?.addEventListener(
    'click',
    () => {
      void loadLibraryPage(
        true,
      );
    },
  );

  librarySearchClear?.addEventListener(
    'click',
    () => {
      clearLibrarySearch();
    },
  );

  librarySearchInput?.addEventListener(
    'input',
    () => {
      librarySearch =
        librarySearchInput
          ?.value
          .trim() ??
        '';

      libraryAfterId =
        null;

      void loadLibraryPage(
        false,
      );
    },
  );

  libraryTableBody?.addEventListener(
    'click',
    (
      event,
    ) => {
      const target =
        event.target;

      if (
        !(
          target instanceof
          HTMLElement
        )
      ) {
        return;
      }

      const button =
        target.closest(
          '[data-track-id]',
        );

      if (
        !(button instanceof
          HTMLElement)
      ) {
        return;
      }

      const trackId =
        button.dataset
          .trackId;

      if (
        trackId
      ) {
        void openTrack(
          trackId,
        );
      }
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
    setText(
      serviceError,
      error instanceof Error
        ? error.message
        : String(error),
    );
  },
);

export function generateWaveform(
  containerId: string,
  bars = 100,
  playedPercent = 25,
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  if (container.childElementCount > 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const playedThreshold = Math.floor((playedPercent / 100) * bars);

  for (let i = 0; i < bars; i += 1) {
    const bar = document.createElement('i');
    const randomHeight = 20 + Math.floor(Math.random() * 78);
    bar.style.height = `${randomHeight}%`;
    if (i < playedThreshold) {
      bar.classList.add('wv-played');
    }
    fragment.appendChild(bar);
  }

  container.appendChild(fragment);
}

export function initNowPlayingControls(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const playBtn = document.querySelector<HTMLButtonElement>(
    '#np-play-btn',
  );
  if (playBtn) {
    let playing = playBtn.textContent?.includes('⏸') ?? false;
    playBtn.addEventListener('click', () => {
      playing = !playing;
      playBtn.textContent = playing ? '⏸' : '⏵';
    });
  }

  const volumeSlider = document.querySelector<HTMLInputElement>(
    '#np-volume-slider',
  );
  const volumeLabel = document.querySelector<HTMLElement>(
    '#np-volume-label',
  );
  if (volumeSlider && volumeLabel) {
    const syncLabel = () => {
      const pct = Number(volumeSlider.value) || 0;
      volumeLabel.textContent = `${pct}%`;
    };
    volumeSlider.addEventListener('input', syncLabel);
    syncLabel();
  }
}

export function initComposerAutoGrow(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const composers = Array.from(
    document.querySelectorAll<HTMLTextAreaElement>(
      'textarea[data-composer="true"], #copilot-composer, #ds-copilot-input',
    ),
  );

  composers.forEach((ta) => {
    const maxRows = 6;
    const resize = () => {
      ta.style.height = 'auto';
      const lines = ta.value.split('\n').length;
      const targetRows = Math.min(
        Math.max(lines, 1),
        maxRows,
      );
      const lineHeight = 20;
      ta.style.height = `${targetRows * lineHeight + 12}px`;
      ta.style.overflowY =
        targetRows >= maxRows ? 'auto' : 'hidden';
    };
    ta.addEventListener('input', resize);
    resize();
  });
}

export function initializeNewShellEnhancements(): void {
  if (typeof document === 'undefined') {
    return;
  }
  generateWaveform('np-wave', 100, 25);
  initNowPlayingControls();
  initComposerAutoGrow();
}

if (typeof document !== 'undefined') {
  const boot = () => {
    bindNewSidebarNav();
    initializeNewShellEnhancements();
  };
  if (
    document.readyState === 'complete' ||
    document.readyState === 'interactive'
  ) {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot, {
      once: true,
    });
  }
}

// --- BEGIN: NUEVO shell wiring (idempotente, safe si falla runtime) ---

type LiveNowPlayingLite = {
  readonly trackId: string;
  readonly title?: string | null;
  readonly artist?: string | null;
  readonly bpm?: number | null;
  readonly musicalKey?: string | null;
  readonly elapsedMs: number;
  readonly durationMs: number | null;
};

type WorkspaceStatsLite = {
  readonly libraryTracks: number;
  readonly playlists: number;
  readonly savedSets: number;
  readonly analyzedHours: number;
  readonly lastSessionAt: string | null;
};

type LibraryItemLite = {
  readonly id: string;
  readonly title: string | null;
  readonly artist: string | null;
  readonly bpm: number | null;
  readonly rating: number | null;
  readonly genre: string | null;
  readonly key: string | null;
  readonly energy?: number | null;
  readonly energyHint01?: number | null;
  readonly playCount: number | null;
};

type UserSettingsLite = {
  syncAgentId?: string;
  rekordboxDbPath?: string;
  npIntervalMs?: number;
  copilotProvider?: string;
  copilotApiKey?: string;
  copilotModel?: string;
  copilotMaxTokens?: number;
  copilotBaseUrl?: string;
};

type LightApiShape = {
  readonly workspace?: {
    readonly aggregateStats?: () => Promise<WorkspaceStatsLite>;
  };
  readonly library?: {
    readonly list?: (opts?: {
      readonly afterId?: string | null;
      readonly limit?: number;
      readonly search?: string;
      readonly genres?: readonly string[] | string | null;
      readonly bpmMin?: number | null;
      readonly bpmMax?: number | null;
      readonly keys?: readonly string[] | string | null;
    }) => Promise<{
      readonly items?: readonly LibraryItemLite[];
      readonly total?: number;
      readonly hasMore?: boolean;
      readonly nextAfterId?: string | null;
    }>;
    readonly get?: (trackId: string) => Promise<
      | {
        technical?: { bpm?: number | null } | null;
        metadata?: { key?: string | null; energy?: number | null } | null;
      }
      | null
    >;
    readonly getById?: (trackId: string) => Promise<
      | {
        technical?: { bpm?: number | null } | null;
        metadata?: { key?: string | null; energy?: number | null } | null;
      }
      | null
    >;
  };
  readonly history?: {
    readonly listSessions?: (limit?: number) => Promise<
      ReadonlyArray<{
        readonly session_id: string;
        readonly started_at: string;
        readonly ended_at: string | null;
        readonly source: string;
        readonly context_tag: string | null;
      }>
    >;
    readonly getSession?: (sessionId: string) => Promise<unknown | null>;
    readonly getSessionTracks?: (sessionId: string) => Promise<
      ReadonlyArray<{ readonly track_id: string; readonly [k: string]: unknown }>
    >;
  };
  readonly preferences?: {
    readonly saveExplicit?: (input: {
      readonly dimension:
        | 'genre'
        | 'artist'
        | 'label'
        | 'key'
        | 'bpm_range'
        | 'energy_range'
        | 'track_exclusion'
        | 'context_affinity';
      readonly value: string;
      readonly kind:
        | 'preferred'
        | 'avoided'
        | 'excluded'
        | 'min'
        | 'max';
    }) => Promise<void>;
    readonly listValues?: (opts?: {
      readonly dimension?:
        | 'genre'
        | 'artist'
        | 'label'
        | 'key'
        | 'bpm_range'
        | 'energy_range'
        | 'track_exclusion'
        | 'context_affinity';
      readonly kind?:
        | 'preferred'
        | 'avoided'
        | 'excluded'
        | 'derived'
        | 'min'
        | 'max';
    }) => Promise<
      ReadonlyArray<{
        readonly value: string;
        readonly kind:
          | 'preferred'
          | 'avoided'
          | 'excluded'
          | 'derived'
          | 'min'
          | 'max';
      }>
    >;
  };
  readonly settings?: {
    readonly get?: () => Promise<UserSettingsLite>;
    readonly save?: (s: UserSettingsLite) => Promise<UserSettingsLite>;
  };
  readonly live?: {
    readonly getNow?: () => Promise<LiveNowPlayingLite | null>;
    readonly subscribe?: (
      listener: (snap: {
        readonly currentNowPlaying: LiveNowPlayingLite | null;
        readonly elapsedSessionMs?: number;
      } | null) => void,
    ) => () => void;
    readonly pushManualTrack?: (track: {
      readonly trackId: string;
      readonly title?: string | null;
      readonly artist?: string | null;
      readonly bpm?: number | null;
      readonly musicalKey?: string | null;
      readonly durationMs?: number | null;
      readonly energyHint01?: number | null;
    }) => Promise<unknown>;
    readonly recommend?: (input: unknown) => Promise<unknown>;
  };
  readonly playlist?: {
    readonly list?: (args?: { readonly search?: string; readonly limit?: number }) => Promise<readonly { readonly id: string; readonly name: string; readonly trackIds: readonly string[] }[]>;
    readonly get?: (args: { readonly id: string }) => Promise<{ readonly id: string; readonly name: string; readonly trackIds: readonly string[] } | null>;
    readonly getTracks?: (args: { readonly id: string }) => Promise<readonly string[]>;
  };
  readonly recommend?: {
    readonly snapshot?: () => Promise<{
      readonly configured: boolean;
      readonly recentCandidates?: ReadonlyArray<Record<string, unknown>> | null;
    }>;
    readonly recommend?: (ctx: unknown) => Promise<RecommendationResult>;
    readonly analyzeSet?: (input: unknown) => Promise<SetIntelligenceResult>;
  };
  readonly copilot?: {
    readonly status?: () => Promise<unknown>;
    readonly chat?: (input: {
      readonly conversationId: string;
      readonly message: string;
    }) => Promise<
      | { readonly ok: true; readonly result: unknown }
      | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
    >;
  };
  readonly setBuilder?: {
    readonly build?: (input: unknown) => Promise<{
      readonly setId: string;
      readonly generatedAt: string;
      readonly tracks: ReadonlyArray<{
        readonly title: string | null;
        readonly artist: string | null;
        readonly bpm: number | null;
        readonly energy: number | null;
        readonly key: string | null;
      }>;
    }>;
  };
};

declare const window: Window & {
  readonly djSync?: LightApiShape;
};

function api(): LightApiShape {
  if (typeof window === 'undefined') {
    return {};
  }
  return (window.djSync ?? {}) as LightApiShape;
}

function shSetText(el: HTMLElement | null, value: unknown): void {
  if (!el) return;
  const txt = value === null || value === undefined
    ? '—'
    : String(value);
  el.textContent = txt;
}

function shFormatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('es-ES').format(Math.trunc(n));
}

function shFormatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

async function wireWorkspaceStats(): Promise<void> {
  const a = api().workspace;
  if (!a?.aggregateStats) return;
  const ids = [
    'stat-tracks',
    'stat-playlists',
    'stat-sets',
    'stat-hours',
    'stat-last-session',
  ] as const;
  const els = new Map<string, HTMLElement>();
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) els.set(id, el);
  }
  if (els.size === 0) return;
  try {
    const stats = await a.aggregateStats();
    shSetText(els.get('stat-tracks') ?? null, shFormatNumber(stats.libraryTracks));
    shSetText(els.get('stat-playlists') ?? null, shFormatNumber(stats.playlists));
    shSetText(els.get('stat-sets') ?? null, shFormatNumber(stats.savedSets));
    const hrs = Number.isFinite(stats.analyzedHours)
      ? stats.analyzedHours.toFixed(1)
      : '0';
    shSetText(els.get('stat-hours') ?? null, `${hrs} h`);
    shSetText(els.get('stat-last-session') ?? null, shFormatDate(stats.lastSessionAt));
  } catch (error) {
    console.warn('[shell] workspaceAggregateStats failed:', error);
  }
}

async function wireBiblioteca(): Promise<void> {
  if (typeof document === 'undefined') return;
  const tableBody = document.getElementById('biblioteca-tbody');
  const countEl = document.getElementById('biblioteca-count');
  const playlistsEl = document.getElementById('biblioteca-playlists');
  const playlistTracksEl = document.getElementById('biblioteca-playlist-tracks');
  const searchInput =
    document.querySelector<HTMLInputElement>('#biblioteca-search');
  const genreSelect =
    document.querySelector<HTMLSelectElement>('#biblioteca-filter-genre');
  const bpmSelect =
    document.querySelector<HTMLSelectElement>('#biblioteca-filter-bpm');
  const keySelect =
    document.querySelector<HTMLSelectElement>('#biblioteca-filter-key');
  const rowsWrap = tableBody;
  if (!rowsWrap) return;
  const a = api().library;
  if (!a?.list) return;

  let afterId: string | null = null;
  let hasMore = true;
  let search = '';
  let busy = false;

  function shInitials(text: string | null): string {
    if (!text) return '—';
    const parts = text.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('').slice(0, 2);
  }

  function shTrackArtColor(title: string, artist: string): string {
    const seed = `${artist}|${title}`;
    const h = shHashCode(seed);
    const hue1 = h % 360;
    const hue2 = (h * 7) % 360;
    return `linear-gradient(135deg,hsl(${hue1} 70% 60%),hsl(${hue2} 65% 30%))`;
  }

  function shEnergyLevel(energy01: number | null | undefined): string {
    if (energy01 == null) return 'wb-energy-mid';
    const pct = Math.max(0, Math.min(1, Number(energy01)));
    if (pct < 0.3) return 'wb-energy-low';
    if (pct < 0.65) return 'wb-energy-mid';
    if (pct < 0.85) return 'wb-energy-high';
    return 'wb-energy-high';
  }

  function shBarHeights(seed: string, count = 9): number[] {
    let h = shHashCode(seed);
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) {
      h = (h * 2654435761) ^ i;
      const n = Math.abs(h) % 100;
      out.push(20 + Math.floor(n * 0.75));
    }
    return out;
  }

  function shFormatCount(n: number): string {
    return n.toLocaleString('es-ES');
  }

  const renderRows = (items: readonly LibraryItemLite[], append: boolean) => {
    if (!append) rowsWrap.innerHTML = '';
    for (const track of items) {
      const tr = document.createElement('tr');
      tr.dataset.trackId = track.id;
      tr.style.cursor = 'pointer';
      const title = track.title ?? 'Untitled';
      const artist = track.artist ?? 'Unknown Artist';
      const bpmTxt = track.bpm != null ? `${track.bpm}` : '—';
      const keyTxt = track.key ?? '—';
      const genreTxt = track.genre ?? '—';
      const ratingStars =
        track.rating != null && track.rating > 0
          ? '★'.repeat(Math.max(0, Math.min(5, Math.round(track.rating))))
          : '';
      const heights = shBarHeights(`${track.id}|${title}|${artist}`, 9);
      const waveLevel = shEnergyLevel(track.energy ?? null);
      const waveInner = heights
        .map(
          (p) =>
            `<i style="height:${p}%"></i>`,
        )
        .join('');
      const initials = shInitials(title);
      const artBg = shTrackArtColor(title, artist);
      tr.innerHTML = `
        <td></td>
        <td><div class="track-mini"><span class="track-mini-art" style="background:${artBg};">${initials}</span><span class="track-mini-name">${shEscapeHtml(title)}</span></div></td>
        <td>${shEscapeHtml(artist)}</td>
        <td><code style="color:var(--text-300); font-family:var(--font-mono);">${bpmTxt}</code></td>
        <td><span class="pill-key">${shEscapeHtml(keyTxt)}</span></td>
        <td><span class="pill-genre">${shEscapeHtml(genreTxt)}</span></td>
        <td class="rating">${ratingStars}</td>
        <td><span class="wave-bar ${waveLevel}" aria-hidden="true">${waveInner}</span></td>`;
      tr.addEventListener('click', () => {
        void api().live?.pushManualTrack?.({
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          bpm: track.bpm,
          musicalKey: track.key,
          energyHint01: track.energy ?? null,
        });
      });
      rowsWrap.appendChild(tr);
    }
  };

  const load = async (reset: boolean) => {
    if (busy) return;
    if (reset) {
      afterId = null;
      hasMore = true;
    }
    if (!hasMore) return;
    busy = true;
    try {
      const filters = normalizePhase62Filters({
        search,
        genre: genreSelect?.value ?? null,
        bpm: bpmSelect?.value ?? null,
        key: keySelect?.value ?? null,
      });
      const opts: {
        readonly afterId?: string | null;
        readonly limit?: number;
        readonly search?: string;
        readonly genres?: readonly string[];
        readonly bpmMin?: number | null;
        readonly bpmMax?: number | null;
        readonly keys?: readonly string[];
      } = {
        afterId: reset ? null : afterId,
        limit: 100,
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.genres.length ? { genres: filters.genres } : {}),
        bpmMin: filters.bpmMin,
        bpmMax: filters.bpmMax,
        ...(filters.keys.length ? { keys: filters.keys } : {}),
      };
      const page = await a.list!(opts);
      const items = page.items ?? [];
      renderRows(items, !reset);
      afterId = page.nextAfterId ?? null;
      hasMore = Boolean(page.hasMore);
      if (typeof page.total === 'number' && countEl) {
        countEl.textContent = `${shFormatCount(page.total)} tracks`;
      }
    } catch (error) {
      console.warn('[shell] library list failed:', error);
      if (countEl) countEl.textContent = '0 tracks';
    } finally {
      busy = false;
    }
  };

  let debounceT: ReturnType<typeof setTimeout> | null = null;
  searchInput?.addEventListener('input', (event) => {
    const next =
      (event.currentTarget as HTMLInputElement | null)?.value ?? '';
    search = next;
    if (debounceT) clearTimeout(debounceT);
    debounceT = setTimeout(() => void load(true), 180);
  });
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      if (debounceT) clearTimeout(debounceT);
      void load(true);
    }
  });
  const reloadOnFilter = () => {
    if (debounceT) clearTimeout(debounceT);
    void load(true);
  };
  genreSelect?.addEventListener('change', reloadOnFilter);
  bpmSelect?.addEventListener('change', reloadOnFilter);
  keySelect?.addEventListener('change', reloadOnFilter);
  void load(true);

  const playlistApi = api().playlist;
  if (playlistsEl && playlistApi?.list) {
    try {
      const playlists = await playlistApi.list({ limit: 2000 });
      playlistsEl.innerHTML = '';
      if (!playlists.length) {
        playlistsEl.innerHTML = '<span class="muted">No hay playlists disponibles.</span>';
      } else {
        for (const playlist of playlists) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'playlist-chip';
          button.textContent = `${playlist.name} · ${playlist.trackIds.length}`;
          button.addEventListener('click', async () => {
            try {
              const ids = typeof playlistApi.getTracks === 'function'
                ? await playlistApi.getTracks({ id: playlist.id })
                : playlist.trackIds;
              if (playlistTracksEl) {
                playlistTracksEl.textContent = `${playlist.name}: ${ids.length} tracks`;
              }
            } catch (error) {
              if (playlistTracksEl) playlistTracksEl.textContent = error instanceof Error ? error.message : String(error);
            }
          });
          playlistsEl.appendChild(button);
        }
      }
    } catch (error) {
      playlistsEl.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}

async function wireNowPlaying(): Promise<void> {
  if (typeof document === 'undefined') return;
  const live = api().live;
  if (!live?.subscribe) return;
  const titleEl = document.getElementById('np-title');
  const artistEl = document.getElementById('np-artist');
  const bpmEl = document.getElementById('np-bpm');
  const keyEl = document.getElementById('np-key');
  const tCur = document.getElementById('np-time-cur');
  const tTot = document.getElementById('np-time-tot');
  try {
    live.subscribe((snap) => {
      const np = snap?.currentNowPlaying ?? null;
      shSetText(titleEl, np?.title ?? 'Nothing playing');
      shSetText(artistEl, np?.artist ?? '—');
      shSetText(bpmEl, np?.bpm != null ? `${np.bpm} BPM` : '—');
      shSetText(keyEl, np?.musicalKey ?? '—');
      const dur = np?.durationMs ?? null;
      const elap = np?.elapsedMs ?? 0;
      shSetText(tCur, shFormatMs(elap));
      shSetText(tTot, dur != null ? shFormatMs(dur) : '—');
      const bars = document.querySelectorAll<HTMLElement>('#np-wave > i');
      const total = bars.length;
      if (total > 0) {
        const ratio = dur && dur > 0 ? Math.max(0, Math.min(1, elap / dur)) : 0;
        const playedUpTo = Math.round(ratio * total);
        bars.forEach((bar, idx) => {
          if (idx < playedUpTo) bar.classList.add('wv-played');
          else bar.classList.remove('wv-played');
        });
      }
    });
  } catch (error) {
    console.warn('[shell] live.subscribe failed:', error);
  }
}

async function wireSettings(): Promise<void> {
  if (typeof document === 'undefined') return;
  const s = api().settings;
  const p = api().preferences;

  const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    document.getElementById(id) as T | null;
  const input = (id: string) => $<HTMLInputElement>(id);
  const selectEl = (id: string) => $<HTMLSelectElement>(id);

  const showSettingsToast = (msg: string) => {
    let toast = $<HTMLDivElement>('settings-saved-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'settings-saved-toast';
      Object.assign(toast.style, {
        position: 'fixed',
        bottom: '96px',
        right: '32px',
        zIndex: '9999',
        background: 'rgba(34,197,94,0.95)',
        color: '#fff',
        padding: '10px 18px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '600',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        fontFamily: 'var(--font-sans)',
      });
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 2200);
  };

  try {
    if (s?.get) {
      const cfg = await s.get();
      if (input('set-sync-agent-id'))
        input('set-sync-agent-id')!.value = String(cfg.syncAgentId ?? '') || input('set-sync-agent-id')!.value;
      if (input('set-rekordbox-db-path'))
        input('set-rekordbox-db-path')!.value = String(cfg.rekordboxDbPath ?? '') || input('set-rekordbox-db-path')!.value;
      if (input('set-np-interval-ms')) {
        const value = typeof cfg.npIntervalMs === 'number' ? String(cfg.npIntervalMs) : null;
        if (value) input('set-np-interval-ms')!.value = value;
      }
      if (selectEl('set-copilot-provider') && cfg.copilotProvider)
        selectEl('set-copilot-provider')!.value = String(cfg.copilotProvider);
      if (input('set-copilot-api-key'))
        input('set-copilot-api-key')!.value = String(cfg.copilotApiKey ?? '') || input('set-copilot-api-key')!.value;
      if (input('set-copilot-model'))
        input('set-copilot-model')!.value = String(cfg.copilotModel ?? '') || input('set-copilot-model')!.value;
      if (input('set-copilot-max-tokens')) {
        const value = typeof cfg.copilotMaxTokens === 'number' ? String(cfg.copilotMaxTokens) : null;
        if (value) input('set-copilot-max-tokens')!.value = value;
      }
      console.log('[shell] settings.get OK, campos cargados:', {
        syncAgentId: cfg.syncAgentId,
        rekordboxDbPath: cfg.rekordboxDbPath,
        npIntervalMs: cfg.npIntervalMs,
        copilotProvider: cfg.copilotProvider,
        copilotModel: cfg.copilotModel,
        copilotMaxTokens: cfg.copilotMaxTokens,
      });
    }
    if (p?.listValues) {
      const [allValues, bpmValues, energyValues] = await Promise.all([
        p.listValues(),
        p.listValues({ dimension: 'bpm_range' }),
        p.listValues({ dimension: 'energy_range' }),
      ]);
      const excludedGenres = allValues
        .filter((entry) => entry.kind === 'excluded')
        .map((entry) => entry.value);
      const bpmMin = bpmValues.find((entry) => entry.kind === 'min')?.value ?? null;
      const bpmMax = bpmValues.find((entry) => entry.kind === 'max')?.value ?? null;
      const energyMin = energyValues.find((entry) => entry.kind === 'min')?.value ?? null;
      const energyMax = energyValues.find((entry) => entry.kind === 'max')?.value ?? null;
      if (input('set-excluded-genres') && excludedGenres.length) input('set-excluded-genres')!.value = excludedGenres.join(', ');
      if (input('set-bpm-min') && bpmMin) input('set-bpm-min')!.value = bpmMin;
      if (input('set-bpm-max') && bpmMax) input('set-bpm-max')!.value = bpmMax;
      if (input('set-energy-min') && energyMin) input('set-energy-min')!.value = energyMin;
      if (input('set-energy-max') && energyMax) input('set-energy-max')!.value = energyMax;
    }
  } catch (error) {
    console.warn('[shell] settings.get failed:', error);
  }

  $('#set-btn-sync-save')?.addEventListener('click', async () => {
    if (!s?.save) return;
    const payload: UserSettingsLite = {};
    if (input('set-sync-agent-id')) payload.syncAgentId = input('set-sync-agent-id')!.value;
    if (input('set-rekordbox-db-path')) payload.rekordboxDbPath = input('set-rekordbox-db-path')!.value;
    const intervalStr = input('set-np-interval-ms')?.value;
    if (intervalStr) {
      const n = Number(intervalStr);
      if (Number.isFinite(n) && n >= 150 && n <= 10000) payload.npIntervalMs = Math.round(n);
    }
    try {
      await s.save(payload);
      showSettingsToast('✅ Sincronización guardada');
    } catch (error) {
      console.warn('[shell] sync save failed', error);
      showSettingsToast('❌ Error guardando');
    }
  });

  $('#set-btn-copilot-save')?.addEventListener('click', async () => {
    if (!s?.save) return;
    const payload: UserSettingsLite = {};
    const provider = selectEl('set-copilot-provider')?.value as
      | 'anthropic'
      | 'openai'
      | 'openai-compatible'
      | undefined;
    if (provider) payload.copilotProvider = provider;
    if (input('set-copilot-api-key')) payload.copilotApiKey = input('set-copilot-api-key')!.value;
    if (input('set-copilot-model')) payload.copilotModel = input('set-copilot-model')!.value;
    const maxTokensStr = input('set-copilot-max-tokens')?.value;
    if (maxTokensStr) {
      const n = Number(maxTokensStr);
      if (Number.isFinite(n) && n >= 256 && n <= 32768) payload.copilotMaxTokens = Math.round(n);
    }
    try {
      await s.save(payload);
      showSettingsToast('🤖 Credenciales guardadas');
    } catch (error) {
      console.warn('[shell] copilot save failed', error);
      showSettingsToast('❌ Error guardando credenciales');
    }
  });

  $('#set-btn-prefs-save')?.addEventListener('click', async () => {
    let ok = 0;
    try {
      if (p?.saveExplicit) {
        const genreStr = input('set-excluded-genres')?.value ?? '';
        const genres = genreStr
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        for (const g of genres) {
          try {
            await p.saveExplicit({
              dimension: 'genre',
              value: g,
              kind: 'excluded',
            });
            ok += 1;
          } catch {
            // skip
          }
        }
        const bpmMin = input('set-bpm-min')?.value;
        if (bpmMin) {
          try {
            await p.saveExplicit({
              dimension: 'bpm_range',
              value: bpmMin,
              kind: 'min',
            });
            ok += 1;
          } catch {
            // skip
          }
        }
        const bpmMax = input('set-bpm-max')?.value;
        if (bpmMax) {
          try {
            await p.saveExplicit({
              dimension: 'bpm_range',
              value: bpmMax,
              kind: 'max',
            });
            ok += 1;
          } catch {
            // skip
          }
        }
        const eMin = input('set-energy-min')?.value;
        if (eMin) {
          try {
            await p.saveExplicit({
              dimension: 'energy_range',
              value: eMin,
              kind: 'min',
            });
            ok += 1;
          } catch {
            // skip
          }
        }
        const eMax = input('set-energy-max')?.value;
        if (eMax) {
          try {
            await p.saveExplicit({
              dimension: 'energy_range',
              value: eMax,
              kind: 'max',
            });
            ok += 1;
          } catch {
            // skip
          }
        }
      }
      showSettingsToast(`🎼 Preferencias aplicadas (${ok} reglas)`);
    } catch (error) {
      console.warn('[shell] prefs save failed', error);
      showSettingsToast('❌ Error guardando preferencias');
    }
  });
}

async function wireHistoryView(): Promise<void> {
  if (typeof document === 'undefined') return;
  const list = api().history;
  if (!list?.listSessions) return;
  const cont = document.getElementById('hist-session-list');
  if (!cont) return;
  try {
    const sessions = await list.listSessions(3);
    const cards = cont.querySelectorAll<HTMLElement>('[data-session-card]');
    sessions.slice(0, 3).forEach((session, idx) => {
      const card = cards[idx];
      if (!card) return;
      const title = card.querySelector<HTMLElement>('[data-session-title]');
      const when = card.querySelector<HTMLElement>('[data-session-when]');
      const meta = card.querySelector<HTMLElement>('[data-session-meta]');
      const src = card.querySelector<HTMLElement>('[data-session-source]');
      if (title) {
        const base = session.context_tag
          ? normalizeContextTag(session.context_tag)
          : 'Set anónimo';
        title.textContent = base;
      }
      if (when) when.textContent = shFormatDate(session.started_at);
      if (meta) {
        const start = new Date(session.started_at).getTime();
        const end = session.ended_at
          ? new Date(session.ended_at).getTime()
          : null;
        const mins = end && end > start
          ? Math.max(1, Math.round((end - start) / 60000))
          : null;
        meta.textContent = mins != null ? `${mins} min · sesión` : 'En progreso';
      }
      if (src) src.textContent = session.source ?? 'live';
    });
  } catch (error) {
    console.warn('[shell] history.listSessions failed:', error);
  }
}

async function wireSetsBuilder(): Promise<void> {
  if (typeof document === 'undefined') return;
  const sb = api().setBuilder;
  if (!sb?.build) return;
  const build = sb.build;
  const btn = document.getElementById('btn-generar-set');
  if (!btn) return;
  const out = document.getElementById('set-builder-output');
  if (!out) return;
  btn.addEventListener('click', async () => {
    const duration = Number(
      (document.getElementById('in-set-duration') as HTMLInputElement | null)?.value ??
        120,
    );
    const eMin = Number(
      (document.getElementById('in-set-emin') as HTMLInputElement | null)?.value ??
        30,
    );
    const eMax = Number(
      (document.getElementById('in-set-emax') as HTMLInputElement | null)?.value ??
        90,
    );
    const genre = (document.getElementById('in-set-genre') as HTMLInputElement | null)?.value.trim() ||
      undefined;
    const key = (document.getElementById('in-set-key') as HTMLInputElement | null)?.value.trim() ||
      undefined;
    const deviceId = 'electron-shell';
    try {
      const lib = await api().library?.list?.({ limit: 100 });
      const ids = (lib?.items ?? []).map((t) => t.id).filter(Boolean);
      if (!ids.length) throw new Error('Library empty; cannot build set.');
      const req: {
        deviceId: string;
        request: string;
        trackIds: readonly string[];
        trackCount: number;
        durationMinutes: number;
        constraints?: {
          allowedGenres?: string[];
          minBpm?: number | null;
          maxBpm?: number | null;
          targetEnergy?: number | null;
        };
      } = {
        deviceId,
        request: `Build Sunset Set · genre=${genre ?? 'any'} · E ${eMin}-${eMax}%`,
        trackIds: ids,
        trackCount: 22,
        durationMinutes: Math.max(20, Number.isFinite(duration) ? duration : 120),
      };
      if (genre) req.constraints = {
        ...(req.constraints ?? {}),
        allowedGenres: [genre],
      };
      if (Number.isFinite(eMin) && Number.isFinite(eMax)) {
        req.constraints = {
          ...(req.constraints ?? {}),
          targetEnergy: ((eMin + eMax) / 2) / 100,
        };
      }
      void key;
      const result = await build(req);
      out.innerHTML = `<div class="set-output-banner ok">Set generado · ${result.tracks.length} tracks · ID ${result.setId.slice(0, 8)}…</div>`;
      const table = document.createElement('div');
      result.tracks.forEach((t, i) => {
        const energyPct =
          t.energy != null
            ? Math.max(0, Math.min(100, Math.round(t.energy * 100)))
            : 40;
        const level = energyPct < 36
          ? 'e-low'
          : energyPct < 58
            ? 'e-mid'
            : energyPct < 78
              ? 'e-high'
              : 'e-ultra';
        const row = document.createElement('div');
        row.className = 'set-row-mini';
        row.innerHTML = `
          <div class="set-rank">${String(i + 1).padStart(2, '0')}</div>
          <div class="set-info">
            <div class="set-title">${shEscapeHtml(t.title ?? 'Untitled')}</div>
            <div class="set-artist dim">${shEscapeHtml(t.artist ?? 'Unknown')} · ${t.bpm ?? '—'} BPM · ${t.key ?? '—'}</div>
            <div class="wave-bar-mini"><div class="wave-bar-fill ${level}" style="width:${energyPct}%"></div></div>
          </div>`;
        table.appendChild(row);
      });
      out.appendChild(table);
    } catch (error) {
      out.innerHTML = `<div class="set-output-banner err">${
        error instanceof Error ? error.message : String(error)
      }</div>`;
    }
  });
}

async function wireRecommendationsView(): Promise<void> {
  if (typeof document === 'undefined') return;
  const out = document.getElementById('recs-list-output');
  const recsCfg = api().recommend;
  const liveApi = api().live;
  if (!out || !recsCfg?.snapshot || !liveApi?.pushManualTrack) return;
  const rows = out.querySelectorAll<HTMLElement>('[data-rec-row]');
  if (!rows.length) return;
  rows.forEach((row) => {
    const titleEl = row.querySelector<HTMLElement>('[data-rec-title]');
    if (!titleEl) return;
    titleEl.addEventListener('click', () => {
      const title = titleEl.textContent ?? '';
      const artist = row.querySelector<HTMLElement>('[data-rec-artist]')?.textContent ?? '';
      const bpmTxt = row.querySelector<HTMLElement>('[data-rec-bpm]')?.textContent?.replace(/\D+/g, '') ?? '';
      const bpm = bpmTxt ? Number(bpmTxt) : null;
      const key = row.querySelector<HTMLElement>('[data-rec-key]')?.textContent.trim() ?? null;
      void liveApi.pushManualTrack!({
        trackId: title.length ? `rec-${shHashCode(title + artist)}` : `rec-${Date.now()}`,
        title,
        artist,
        bpm: Number.isFinite(bpm) ? bpm : null,
        musicalKey: key,
      });
    });
  });
}

function normalizeContextTag(tag: string): string {
  const map: Record<string, string> = {
    opening: 'Opening Warmup',
    warmup: 'Warmup Session',
    build: 'Build-Up Mix',
    peak: 'Peak Time Set',
    bridge: 'Bridge Transition',
    cooldown: 'Cooldown Session',
    closing: 'Closing Set',
    afterhours: 'Afterhours',
    unknown: 'Anonymous Set',
  };
  return map[tag] ?? tag;
}

function shFormatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function shEscapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shHashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// --- FINAL: NUEVAS funciones wire para SHELL 8-VISTAS (append-only, NO toca legacy) ---

function shActivateView(viewId: string): void {
  if (typeof document === 'undefined') return;
  const clean = viewId.startsWith('#view-')
    ? viewId.slice(1)
    : viewId.startsWith('view-')
      ? viewId
      : `view-${viewId}`;
  const target = document.getElementById(clean);
  if (!target) return;
  document.querySelectorAll<HTMLElement>('.view-wrapper.view-active').forEach((el) => {
    if (el.id !== clean) el.classList.remove('view-active');
  });
  target.classList.add('view-active');
  const copilotPanel = document.getElementById('copilot-panel');
  const mainPanel = document.getElementById('main-panel');
  if (copilotPanel && mainPanel) {
    if (clean === 'view-inicio') {
      mainPanel.classList.add('has-copilot');
    } else {
      mainPanel.classList.remove('has-copilot');
    }
  }
  if (typeof window !== 'undefined') {
    try {
      const expected = `#${clean}`;
      if (window.location.hash !== expected) {
        window.history.replaceState(null, '', expected);
      }
    } catch {
      // ignore
    }
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function wireNewHashNavigation(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const applyFromHash = () => {
    let h = (window.location.hash || '#view-inicio').trim();
    if (!h.startsWith('#view-')) h = '#view-inicio';
    shActivateView(h);
  };
  window.addEventListener('hashchange', applyFromHash);
  window.addEventListener('DOMContentLoaded', applyFromHash, { once: true });
  if (document.readyState !== 'loading') {
    applyFromHash();
  }
}

function wireNewNowPlayingWaveformInit(): void {
  if (typeof document === 'undefined') return;
  const wave = document.getElementById('np-wave');
  if (!wave) return;
  wave.innerHTML = Array.from(
    { length: 32 },
    () => '<i></i>',
  ).join('');
}

async function wireNewRecommendationsView(): Promise<void> {
  if (typeof document === 'undefined') return;
  const view = document.getElementById('view-recomendaciones');
  if (!view) return;
  const tbody = view.querySelector<HTMLTableSectionElement>('tbody');
  const library = api().library;
  const recommend = api().recommend;
  const live = api().live;
  if (!tbody || !library?.list || !recommend?.recommend || !live?.getNow) return;

  const renderEmpty = (message: string): void => {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="padding:24px;text-align:center;">${shEscapeHtml(message)}</td></tr>`;
  };

  try {
    const nowPlaying = await live.getNow();
    if (!nowPlaying?.trackId) {
      renderEmpty('Reproduce un track para generar recomendaciones reales.');
      return;
    }

    const page = await library.list({ limit: 250 });
    const candidates = (page.items ?? []).map((track) => ({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre,
      key: track.key,
      bpm: track.bpm,
      energy: track.energy ?? null,
      rating: track.rating,
      playCount: track.playCount,
    }));

    const current = candidates.find((candidate) => candidate.trackId === nowPlaying.trackId) ?? {
      trackId: nowPlaying.trackId,
      title: nowPlaying.title ?? null,
      artist: nowPlaying.artist ?? null,
      genre: null,
      key: nowPlaying.musicalKey ?? null,
      bpm: nowPlaying.bpm ?? null,
      energy: null,
      rating: null,
      playCount: null,
    };

    const context = buildPhase62RecommendationContext({
      deviceId: 'electron-shell',
      currentTrack: current,
      candidates,
      request: `Siguiente track compatible con ${current.title ?? current.trackId}`,
      limit: 6,
    });

    const result = await recommend.recommend(context);
    const recommendationRows = result.recommendations.slice(0, context.limit);
    if (!recommendationRows.length) {
      renderEmpty('No hay tracks elegibles con las restricciones actuales.');
      return;
    }

    const candidateById = new Map(candidates.map((candidate) => [candidate.trackId, candidate]));
    tbody.innerHTML = '';
    for (const recommendation of recommendationRows) {
      const candidate = candidateById.get(recommendation.trackId);
      if (!candidate) continue;
      const title = candidate.title?.trim() || 'Untitled';
      const artist = candidate.artist?.trim() || 'Unknown Artist';
      const key = candidate.key?.trim() || '—';
      const match = Math.max(0, Math.min(100, Math.round(recommendation.score * 100)));
      const initials = `${title.charAt(0)}${artist.charAt(0)}`.toUpperCase() || '??';
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td>${recommendation.rank}</td>
        <td><div class="track-mini"><span class="track-mini-art">${shEscapeHtml(initials)}</span><span class="track-mini-name">${shEscapeHtml(title)}</span></div></td>
        <td>${shEscapeHtml(artist)}<div class="muted" style="font-size:11px;margin-top:3px;">${shEscapeHtml(recommendation.reasons[0]?.detail ?? 'Compatible con el contexto actual.')}</div></td>
        <td style="font-family:var(--font-mono);">${candidate.bpm ?? '—'}</td>
        <td><span class="pill-key">${shEscapeHtml(key)}</span></td>
        <td style="font-weight:600;">${match}%</td>
        <td>${shEscapeHtml(recommendation.transition.keyRelation)}</td>`;
      tr.addEventListener('click', () => {
        void live.pushManualTrack?.({
          trackId: candidate.trackId,
          title: candidate.title,
          artist: candidate.artist,
          bpm: candidate.bpm,
          musicalKey: candidate.key,
          energyHint01: candidate.energy,
        });
      });
      tbody.appendChild(tr);
    }
  } catch (error) {
    renderEmpty(error instanceof Error ? error.message : String(error));
  }
}

let lastHistorialAnalyzePayload:
  | null
  | {
    sessionId: string;
    request: string;
    trackIds: readonly string[];
  } = null;

async function wireNewHistorialView(): Promise<void> {
  if (typeof document === 'undefined') return;
  const view = document.getElementById('view-historial');
  if (!view) return;
  const tbody = view.querySelector<HTMLTableSectionElement>('tbody');
  const history = api().history;
  const library = api().library;
  if (!tbody || !history?.getSessionTracks || !library?.getById) return;

  const render = (rows: ReadonlyArray<{
    sessionId: string;
    startedAt: string;
    endedAt?: string | null;
    contextTag?: string | null;
    source?: string;
    trackCount: number;
    avgBpm: number | null;
    energy: number | null;
    harmonicKey: string | null;
    displayName: string;
  }>): void => {
    tbody.innerHTML = '';
    rows.slice(0, 3).forEach((s, idx) => {
      const initials = (() => {
        const name = s.displayName.trim();
        if (!name) return 'S';
        const parts = name.split(/\s+/);
        return (parts[0]!.charAt(0) + (parts[1]?.charAt(0) ?? '')).toUpperCase();
      })();
      const gradientPool = [
        'linear-gradient(135deg,#6366f1,#a855f7)',
        'linear-gradient(135deg,#fb923c,#7c2d12)',
        'linear-gradient(135deg,#4ade80,#065f46)',
      ];
      const artBg = gradientPool[idx % gradientPool.length] ?? gradientPool[0];
      const date = (() => {
        try {
          const d = new Date(s.startedAt);
          return d.toISOString().slice(0, 10);
        } catch {
          return s.startedAt?.slice(0, 10) ?? '—';
        }
      })();
      const dur = (() => {
        try {
          const start = new Date(s.startedAt).getTime();
          const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            const m = Math.round((end - start) / 60000);
            if (m < 60) return `${m}m`;
            const h = Math.floor(m / 60);
            const rem = m % 60;
            return `${h}h ${rem}m`;
          }
          return '—';
        } catch {
          return '—';
        }
      })();
      const bpmTxt = s.avgBpm != null
        ? (Math.round(s.avgBpm * 10) / 10).toFixed(1)
        : '—';
      const eNum = s.energy != null ? s.energy : 6 + idx;
      const energyTxt = `${Math.round(eNum * 10) / 10} / 10`;
      const eColor =
        eNum >= 7.5
          ? 'var(--energy-orange)'
          : eNum >= 6
            ? 'var(--energy-green)'
            : 'var(--energy-yellow)';
      const keyTxt = s.harmonicKey ?? '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:var(--font-mono); color:var(--text-300);">${shEscapeHtml(date)}</td>
        <td><div class="track-mini"><span class="track-mini-art" style="background:${artBg}; font-size:14px;">${initials}</span><span class="track-mini-name">${shEscapeHtml(s.displayName)}</span></div></td>
        <td>${shEscapeHtml(dur)}</td>
        <td>${s.trackCount}</td>
        <td style="font-family:var(--font-mono);">${shEscapeHtml(bpmTxt)}</td>
        <td style="color:${eColor}; font-weight:600;">${energyTxt}</td>
        <td><span class="pill-key">${shEscapeHtml(keyTxt)}</span></td>
        <td style="text-align:right;"><button class="btn-ghost" type="button">Ver análisis →</button></td>`;
      const btn = tr.querySelector<HTMLButtonElement>('button');
      if (btn) {
        btn.addEventListener('click', async () => {
          try {
            if (typeof history?.getSessionTracks !== 'function') return;
            const tracks = await history.getSessionTracks(s.sessionId);
            const ids = tracks.map((r) => r.track_id).filter((x) => Boolean(x));
            lastHistorialAnalyzePayload = {
              sessionId: s.sessionId,
              request: `Análisis de ${s.displayName} · ${date} · ${ids.length} tracks`,
              trackIds: ids,
            };
            const titleH3 = view.ownerDocument.querySelector<HTMLElement>(
              '#view-analisis h3',
            );
            if (titleH3) {
              titleH3.textContent = s.displayName;
              const meta = titleH3.parentElement?.querySelector('p');
              if (meta) {
                const trackCount = ids.length;
                meta.textContent = `${date} · ${dur} · ${trackCount} tracks`;
              }
            }
            const analysis = await api().recommend?.analyzeSet?.({
              deviceId: 'electron-shell',
              request: lastHistorialAnalyzePayload.request,
              trackIds: ids,
            });
            if (!analysis) throw new Error('Set analysis unavailable.');

            const fullTracks = await Promise.all(
              ids.map(async (id) => api().library?.getById?.(id).catch(() => null) ?? null),
            );
            const validTracks = fullTracks.filter((track): track is NonNullable<typeof track> => track !== null);
            const keyCounts = new Map<string, number>();
            for (const track of validTracks) {
              const key = track.metadata?.key?.trim();
              if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
            }

            const metrics = view.ownerDocument.querySelectorAll<HTMLElement>(
              '#view-analisis .metrics-5-grid .metric-card',
            );
            const averageEnergy = analysis.energyCurve.length
              ? analysis.energyCurve.reduce((sum, value) => sum + value, 0) / analysis.energyCurve.length
              : null;
            const values: Array<number | string | null> = [
              averageEnergy,
              analysis.bpmRange.min != null && analysis.bpmRange.max != null
                ? (analysis.bpmRange.min + analysis.bpmRange.max) / 2
                : null,
              [...keyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
              analysis.bpmRange.min != null && analysis.bpmRange.max != null
                ? analysis.bpmRange.max - analysis.bpmRange.min
                : null,
              analysis.warnings.length ? Math.max(0, 10 - analysis.warnings.length) : 10,
            ];
            metrics.forEach((card, i) => {
              const value = card.querySelector<HTMLElement>('.value');
              if (!value) return;
              const current = values[i];
              if (i === 0 || i === 4) {
                value.innerHTML = `${typeof current === 'number' ? current.toFixed(1) : '—'} <span class="sub">/ 10</span>`;
              } else if (i === 2) {
                value.innerHTML = `<span class="pill-key" style="font-size:17px;">${shEscapeHtml(typeof current === 'string' ? current : '—')}</span>`;
              } else {
                value.textContent = typeof current === 'number' ? current.toFixed(1) : '—';
              }
            });

            const warningsEl = view.ownerDocument.querySelector<HTMLElement>('#set-analysis-warnings');
            if (warningsEl) {
              warningsEl.innerHTML = analysis.warnings.length
                ? analysis.warnings.map((warning) => `<li>${shEscapeHtml(warning)}</li>`).join('')
                : '<li>Sin advertencias.</li>';
            }
            const curveEl = view.ownerDocument.querySelector<HTMLElement>('#set-analysis-energy-curve');
            if (curveEl) {
              curveEl.innerHTML = analysis.energyCurve.length
                ? analysis.energyCurve.map((energy) => `<i title="${energy.toFixed(1)}/10" style="height:${Math.max(4, Math.min(100, energy * 10))}%"></i>`).join('')
                : '<span class="muted">Sin datos de energía.</span>';
            }
            const histogramEl = view.ownerDocument.querySelector<HTMLElement>('#set-analysis-key-histogram');
            if (histogramEl) {
              histogramEl.innerHTML = keyCounts.size
                ? [...keyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                    .map(([key, count]) => `<span><b>${shEscapeHtml(key)}</b> ${count}</span>`).join('')
                : '<span class="muted">Sin datos de tonalidad.</span>';
            }
            shActivateView('#view-analisis');
          } catch (error) {
            console.warn('[shell] Ver análisis click failed:', error);
          }
        });
      }
      tbody.appendChild(tr);
    });
  };

  try {
    const sessionRows = await (history.listSessions?.(6) ?? Promise.resolve([]));
    const hydrated = await Promise.all(
      (sessionRows ?? []).slice(0, 6).map(async (row) => {
        const tracks = typeof history?.getSessionTracks === 'function'
          ? await history.getSessionTracks(row.session_id)
          : [];
        let avgBpm: number | null = null;
        let harmonicKey: string | null = null;
        const keyCount = new Map<string, number>();
        let energy = 0;
        let n = 0;
        for (const t of tracks) {
          try {
            const full = await library.getById!(t.track_id);
            const b = (full as unknown as { technical?: { bpm?: number | null } } | null)
              ?.technical?.bpm ?? null;
            if (typeof b === 'number') {
              avgBpm = (avgBpm ?? 0) + b;
              n += 1;
            }
            const k = (full as unknown as { metadata?: { key?: string | null } } | null)
              ?.metadata?.key ?? null;
            if (k) {
              keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
            }
            const eng = (full as unknown as { metadata?: { energy?: number | null } } | null)
              ?.metadata?.energy ?? null;
            if (typeof eng === 'number') energy += Math.min(10, Math.max(0, eng));
          } catch {
            // skip individual track
          }
        }
        if (avgBpm !== null && n > 0) avgBpm = Math.round((avgBpm / n) * 10) / 10;
        let topK: [string, number] | null = null;
        for (const e of keyCount.entries()) {
          if (!topK || e[1] > topK[1]) topK = e;
        }
        harmonicKey = topK ? topK[0] : null;
        const energyNorm = n > 0 ? Math.round((energy / n) * 10) / 10 : null;
        const displayName = row.context_tag
          ? normalizeContextTag(row.context_tag)
          : `Set ${row.session_id.slice(0, 6)}`;
        return {
          sessionId: row.session_id,
          startedAt: row.started_at,
          endedAt: row.ended_at ?? null,
          contextTag: row.context_tag ?? null,
          source: row.source ?? 'live',
          trackCount: tracks.length,
          avgBpm,
          energy: energyNorm,
          harmonicKey,
          displayName,
        };
      }),
    );
    if (hydrated.length) {
      render(hydrated);
    }
  } catch (error) {
    console.warn('[shell] history view load failed:', error);
  }
}

function wireNewCopilotChatComposer(
  textareaId: string,
  sendBtnId: string,
  listId?: string,
): void {
  if (typeof document === 'undefined') return;
  const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
  const btn = document.getElementById(sendBtnId) as HTMLButtonElement | null;
  const list = listId
    ? document.getElementById(listId) as HTMLDivElement | null
    : null;
  const copilot = api().copilot;
  if (!textarea || !btn || !copilot?.chat) return;
  const conversationId = `chat-${Date.now().toString(36)}`;

  const append = (role: 'user' | 'bot', content: string) => {
    if (!list) return;
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '12px';
    wrap.style.alignSelf = role === 'user' ? 'flex-end' : 'flex-start';
    wrap.style.maxWidth = '78%';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.style.width = '34px';
    avatar.style.height = '34px';
    avatar.style.flex = '0 0 auto';
    avatar.textContent = role === 'user' ? '🧑' : '🤖';
    const bubble = document.createElement('div');
    bubble.style.padding = '12px 16px';
    bubble.style.background = role === 'user'
      ? 'rgba(99,102,241,0.16)'
      : 'var(--bg-glass)';
    bubble.style.border = '1px solid var(--border-200)';
    bubble.style.borderRadius = role === 'user'
      ? '16px 0 16px 16px'
      : '0 16px 16px 16px';
    const p = document.createElement('p');
    p.style.margin = '0';
    p.style.fontSize = '13.5px';
    p.style.lineHeight = '1.55';
    p.style.color = 'var(--text-200)';
    p.textContent = content;
    bubble.appendChild(p);
    wrap.append(role === 'user' ? bubble : avatar);
    if (role === 'user') wrap.prepend(avatar);
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
  };

  const send = async () => {
    const msg = textarea.value.trim();
    if (!msg) return;
    append('user', msg);
    textarea.value = '';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    try {
      const r = await copilot.chat!({ conversationId, message: msg });
      if (r.ok) {
        const txt = typeof r.result === 'string'
          ? r.result
          : typeof (r.result as { message?: string } | null)?.message ===
              'string'
            ? (r.result as { message: string }).message
            : JSON.stringify(r.result, null, 2);
        append('bot', txt || 'Respuesta vacía.');
      } else {
        append(
          'bot',
          `Error (${r.error.code || 'unknown'}): ${r.error.message || 'Failed'}`,
        );
      }
    } catch (error) {
      append(
        'bot',
        `Ocurrió un error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  btn.addEventListener('click', () => { void send(); });
  textarea.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void send();
    }
  });
}

async function wireNewCopilotViews(): Promise<void> {
  wireNewCopilotChatComposer(
    'cp-chat-textarea',
    'cp-chat-send',
    'ds-message-list',
  );
  wireNewCopilotChatComposer('cp-panel-textarea', 'cp-panel-send');
}

export async function wireNewShellRuntime(): Promise<void> {
  if (typeof document === 'undefined') return;
  wireNewNowPlayingWaveformInit();
  wireNewHashNavigation();
  await Promise.allSettled([
    wireWorkspaceStats(),
    wireBiblioteca(),
    wireNowPlaying(),
    wireSettings(),
    wireHistoryView(),
    wireSetsBuilder(),
    wireRecommendationsView(),
    // Shell 8 vistas NUEVO:
    wireNewRecommendationsView(),
    wireNewHistorialView(),
    wireNewCopilotViews(),
  ]);
}

void lastHistorialAnalyzePayload;

if (typeof document !== 'undefined') {
  const bootAll = () => void wireNewShellRuntime();
  if (
    document.readyState === 'complete' ||
    document.readyState === 'interactive'
  ) {
    bootAll();
  } else {
    document.addEventListener('DOMContentLoaded', bootAll, { once: true });
  }
}

// --- END: NUEVO shell wiring ---
