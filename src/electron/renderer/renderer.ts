import type {
  DJSyncApplicationSnapshot,
  NormalizedTrack,
  LibraryPage,
  LibraryTrackSummary,
} from '../ipc/contracts.js';

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
  const status =
    snapshot.service.service;

  const cardStatus:
    CardStatus =
    status.state ===
    'running'
      ? 'success'
      : status.state ===
          'stopped'
        ? 'warning'
        : 'unknown';

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
      ? status.pid !==
        null
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