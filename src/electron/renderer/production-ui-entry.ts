import {
  createInitialProductionUiSnapshot,
  mountProductionUi,
} from './production-ui/index.js';

import type {
  DJSyncApplicationSnapshot,
  CopilotActionUiResult,
  CopilotPendingActionView,
  UserSettings,
} from '../ipc/contracts.js';

import type {
  ProductionActivityItem,
  ProductionCopilotMessage,
  ProductionCopilotState,
  ProductionActionPreview,
  ProductionTrack,
  ProductionUiSnapshot,
  ProductionSyncState,
} from './production-ui/production-ui-types.js';

const rootElement =
  document.querySelector<HTMLElement>(
    '#production-ui-root',
  );

if (!rootElement) {
  throw new Error(
    'Production UI root element was not found.',
  );
}

const root: HTMLElement =
  rootElement;

const conversationId =
  globalThis.crypto?.randomUUID?.() ??
  `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let snapshot =
  createInitialProductionUiSnapshot();

let applicationSubscription:
  (() => void) | null =
  null;

let activityCounter = 0;
let lastReportedRunKey = '';
let viewModeObserver:
  MutationObserver |
  null =
  null;

type RendererView =
  | 'dashboard'
  | 'library'
  | 'audio'
  | 'settings'
  | 'copilot';

let activeView:
  RendererView =
  'dashboard';

function resolveDsViewMode(
  view:
    RendererView,
):
  | 'dashboard-only'
  | 'copilot-only'
  | null {
  switch (
    view
  ) {
    case 'dashboard':
      return 'dashboard-only';
    case 'copilot':
      return 'copilot-only';
    default:
      return null;
  }
}

function applyDsViewMode(
  view:
    RendererView,
):
  void {
  const shell =
    root.querySelector<
      HTMLElement
    >(
      '.ds-shell',
    );

  if (
    shell ===
    null
  ) {
    return;
  }

  const mode =
    resolveDsViewMode(
      view,
    );

  if (
    mode ===
    null
  ) {
    shell.removeAttribute(
      'data-ds-view-mode',
    );
  } else {
    shell.setAttribute(
      'data-ds-view-mode',
      mode,
    );
  }
}

function ensureViewModeObserver():
  void {
  if (
    viewModeObserver !==
    null
  ) {
    return;
  }

  viewModeObserver =
    new MutationObserver(
      () => {
        applyDsViewMode(
          activeView,
        );
      },
    );

  viewModeObserver.observe(
    root,
    {
      childList:
        true,
      subtree:
        true,
    },
  );
}

let settingsPanel:
  | HTMLElement
  | null =
  null;

let settingsOpen =
  false;

const DRAFT_SETTINGS_DEFAULTS:
  Required<
    UserSettings
  > = {
    syncAgentId:
      '',
    syncApiUrl:
      '',
    syncApiKey:
      '',
    rekordboxDbPath:
      '',
    rekordboxDbKey:
      '',
    rekordboxCipherCompatibility:
      4,
    copilotProvider:
      'openai',
    copilotApiKey:
      '',
    copilotBaseUrl:
      '',
    copilotModel:
      '',
    intelligenceJobsApiUrl:
      '',
    logLevel:
      'info',
  };

let draftSettings:
  Required<
    UserSettings
  > = {
    ...DRAFT_SETTINGS_DEFAULTS,
  };

function now(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function nextId(prefix: string): string {
  activityCounter += 1;
  return `${prefix}-${Date.now()}-${activityCounter}`;
}

function withActivity(
  item: Omit<ProductionActivityItem, 'id' | 'timestamp'>,
): ProductionActivityItem {
  return {
    ...item,
    id: nextId('activity'),
    timestamp: now(),
  };
}

function withMessage(
  role: ProductionCopilotMessage['role'],
  content: string,
): ProductionCopilotMessage {
  return {
    id: nextId('message'),
    role,
    content,
    createdAt: now(),
  };
}

function toProductionTrack(
  track: {
    readonly identity: { readonly id: string };
    readonly metadata: {
      readonly title: string | null;
      readonly artist: string | null;
      readonly album: string | null;
      readonly key: string | null;
    };
    readonly technical: {
      readonly bpm: number | null;
    };
  },
): ProductionTrack {
  return {
    id: track.identity.id,
    title: track.metadata.title ?? 'Untitled',
    artist: track.metadata.artist ?? 'Unknown',
    album: track.metadata.album ?? null,
    bpm: track.technical.bpm ?? null,
    key: track.metadata.key ?? null,
    artworkUrl: null,
  };
}

function toProductionActionPreview(
  pending: CopilotPendingActionView,
): ProductionActionPreview | null {
  if (
    pending.status !==
      'pending'
  ) {
    return null;
  }

  return {
    id: pending.id,
    title: pending.title,
    description:
      pending.description,
    risk: pending.risk,
    affectedResources: [
      ...pending.affectedResources,
    ],
    reversible:
      pending.reversible,
    status: pending.status,
  };
}

function navButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[data-view]',
    ),
  );
}

function syncNavigation(
  view: RendererView = activeView,
): void {
  navButtons().forEach(
    (button) => {
      const active =
        button.dataset.view ===
        view;

      button.classList.toggle(
        'nav-active',
        active,
      );

      button.classList.toggle(
        'active',
        active,
      );

      if (active) {
        button.setAttribute(
          'aria-current',
          'page',
        );
      } else {
        button.removeAttribute(
          'aria-current',
        );
      }
    },
  );
}

function showProductionWorkspace(
  visible: boolean,
): void {
  root.hidden = !visible;

  root.setAttribute(
    'aria-hidden',
    visible ? 'false' : 'true',
  );

  const dashboardView =
    document.querySelector<HTMLElement>(
      '#view-dashboard',
    );

  if (visible) {
    dashboardView?.classList.remove(
      'view-hidden',
    );
  }
}

function setView(
  view: RendererView,
  options: {
    readonly scrollToCopilot?: boolean;
  } = {},
): void {
  activeView = view;

  const dashboardView =
    document.querySelector<HTMLElement>(
      '#view-dashboard',
    );

  const libraryView =
    document.querySelector<HTMLElement>(
      '#view-library',
    );

  const audioView =
    document.querySelector<HTMLElement>(
      '#view-audio',
    );

  const settingsView =
    document.querySelector<HTMLElement>(
      '#view-settings',
    );

  const allViews: HTMLElement[] =
    [
      dashboardView,
      libraryView,
      audioView,
      settingsView,
    ].filter(
      (el): el is HTMLElement =>
        el !== null,
    );

  function hide(
    el: HTMLElement,
  ): void {
    el.classList.add(
      'view-hidden',
    );
  }

  function show(
    el: HTMLElement,
  ): void {
    el.classList.remove(
      'view-hidden',
    );
  }

  allViews.forEach(
    hide,
  );

  if (
    view === 'dashboard' ||
    view === 'copilot'
  ) {
    if (
      dashboardView !==
      null
    ) {
      show(
        dashboardView,
      );
    }

    showProductionWorkspace(
      true,
    );

    if (
      view ===
      'dashboard'
    ) {
      dashboardView?.scrollTo(
        {
          top:
            0,
          left:
            0,
          behavior:
            'auto',
        },
      );

      window.scrollTo(
        {
          top:
            0,
          left:
            0,
          behavior:
            'auto',
        },
      );
    }
  } else if (
    view ===
    'library'
  ) {
    if (
      libraryView !==
      null
    ) {
      show(
        libraryView,
      );
    }

    showProductionWorkspace(
      false,
    );
  } else if (
    view ===
    'audio'
  ) {
    if (
      audioView !==
      null
    ) {
      show(
        audioView,
      );
    }

    showProductionWorkspace(
      false,
    );
  } else if (
    view ===
    'settings'
  ) {
    if (
      settingsView !==
      null
    ) {
      show(
        settingsView,
      );
    }

    showProductionWorkspace(
      false,
    );
  }

  syncNavigation(
    view,
  );

  if (
    options.scrollToCopilot &&
    view === 'copilot'
  ) {
    document
      .querySelector<HTMLElement>(
        '#ds-copilot-title',
      )
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

    window.setTimeout(
      () => {
        document
          .querySelector<HTMLTextAreaElement>(
            '#ds-copilot-input',
          )
          ?.focus({
            preventScroll: true,
          });
      },
      150,
    );
  }
}

function installCopilotNavigation(): void {
  if (
    document.querySelector(
      '#nav-copilot',
    )
  ) {
    syncNavigation();
    return;
  }

  const dashboardNav =
    document.querySelector<HTMLButtonElement>(
      '#nav-dashboard',
    );

  const parent =
    dashboardNav?.parentElement;

  if (!dashboardNav || !parent) {
    return;
  }

  const navigationButton =
    dashboardNav.cloneNode(
      true,
    ) as HTMLButtonElement;

  navigationButton.id =
    'nav-copilot';
  navigationButton.type =
    'button';
  navigationButton.textContent =
    'Copilot';
  navigationButton.dataset.view =
    'copilot';
  navigationButton.classList.remove(
    'nav-active',
  );
  navigationButton.classList.remove(
    'active',
  );
  navigationButton.removeAttribute(
    'aria-current',
  );
  navigationButton.setAttribute(
    'aria-label',
    'Open DJ Copilot',
  );

  parent.appendChild(
    navigationButton,
  );

  syncNavigation();
}

let legacySetViewListenerInstalled =
  false;

function ensureLegacySetViewListener():
  void {
  if (
    legacySetViewListenerInstalled
  ) {
    return;
  }

  legacySetViewListenerInstalled =
    true;

  document.addEventListener(
    'dj-sync:set-view',
    (
      event: Event,
    ) => {
      const custom =
        event as CustomEvent<
          'dashboard' | 'library' | 'audio' | 'copilot' | 'settings'
        >;

      if (
        typeof custom
          ?.detail ===
          'string'
      ) {
        setView(
          custom
            .detail,
        );
      }
    },
  );
}

function installNavigationController(): void {
  installCopilotNavigation();
  ensureLegacySetViewListener();

  document.addEventListener(
    'click',
    (event) => {
      const target =
        event.target;

      if (
        !(target instanceof Element)
      ) {
        return;
      }

      const button =
        target.closest<HTMLButtonElement>(
          'button[data-view]',
        );

      if (!button) {
        return;
      }

      const view =
        button.dataset.view;

      if (
        view !== 'dashboard' &&
        view !== 'library' &&
        view !== 'audio' &&
        view !== 'copilot' &&
        view !== 'settings'
      ) {
        return;
      }

      const nextView =
        view as RendererView;

      if (
        nextView ===
        'copilot'
      ) {
        event.preventDefault();
        event.stopPropagation();
        setView(
          'copilot',
          {
            scrollToCopilot:
              true,
          },
        );
        return;
      }

      activeView =
        nextView;

      queueMicrotask(
        () => {
          setView(nextView);
        },
      );
    },
    true,
  );

  const navigationHost =
    document.querySelector<HTMLElement>(
      '#nav-dashboard',
    )?.parentElement;

  if (navigationHost) {
    const observer =
      new MutationObserver(() => {
        installCopilotNavigation();
        syncNavigation();
      });

    observer.observe(
      navigationHost,
      {
        childList: true,
        attributes: true,
        attributeFilter: [
          'class',
          'aria-current',
          'data-view',
        ],
      },
    );

    window.addEventListener(
      'beforeunload',
      () => observer.disconnect(),
      { once: true },
    );
  }

  setView('dashboard');
}

function apply(
  next: ProductionUiSnapshot,
): void {
  snapshot = next;
  ui.update(snapshot);

  if (
    activeView === 'dashboard' ||
    activeView === 'copilot'
  ) {
    syncNavigation(activeView);
  }
}

function applyApplicationSnapshot(
  application: DJSyncApplicationSnapshot,
): void {
  const previousSync = snapshot.sync;
  const syncStatus =
    application.service.sync.status;

  let sync: ProductionSyncState =
    'idle';

  if (
    syncStatus ===
    'running'
  ) {
    sync = 'running';
  } else if (
    syncStatus ===
    'failed'
  ) {
    sync = 'error';
  }

  const lastRun =
    application.service.sync.lastRun;

  const detail =
    application.service.sync.lastRun?.completed ===
    true
      ? `Last run completed · ${application.service.sync.lastRun.processed} processed`
      : application.service.sync.lastRun?.lastError ??
        (
          application.service.sync.status ===
          'running'
            ? 'Synchronization is running.'
            : 'Waiting for the synchronization service.'
        );

  const connection =
    application.service.server.configured &&
    !application.service.server.healthy
      ? ('degraded' as const)
      : ('connected' as const);

  const activities =
    [...snapshot.activities];

  if (
    previousSync !==
    sync
  ) {
    activities.push(
      withActivity({
        label:
          sync === 'running'
            ? 'Sync started'
            : sync === 'error'
              ? 'Sync failed'
              : 'Sync idle',
        detail,
        status:
          sync === 'error'
            ? 'error'
            : sync === 'running'
              ? 'info'
              : 'success',
      }),
    );
  }

  const runKey =
    lastRun?.completed ===
    true
      ? `${lastRun.finishedAt ?? ''}:${lastRun.processed}`
      : '';

  if (
    runKey &&
    runKey !==
      lastReportedRunKey
  ) {
    lastReportedRunKey =
      runKey;

    activities.push(
      withActivity({
        label:
          'Sync completed',
        detail:
          `${lastRun?.processed ?? 0} tracks processed in ${lastRun?.elapsedMs ?? 0} ms.`,
        status:
          'success',
      }),
    );
  }

  apply({
    ...snapshot,
    connection,
    sync,
    syncDetail: detail,
    activities:
      activities.slice(-100),
    error: null,
    track: snapshot.track,
    pendingAction: snapshot.pendingAction,
  });
}

function setBusy(
  busy: boolean,
): void {
  apply({
    ...snapshot,
    busy,
  });
}

function setCopilot(
  copilot: ProductionCopilotState,
  error: string | null = snapshot.error,
): void {
  apply({
    ...snapshot,
    copilot,
    error,
  });
}

function addAssistantMessage(
  content: string,
): void {
  apply({
    ...snapshot,
    copilotMessages: [
      ...snapshot.copilotMessages,
      withMessage(
        'assistant',
        content,
      ),
    ].slice(-60),
  });
}

function addUserMessage(
  content: string,
): void {
  apply({
    ...snapshot,
    copilotMessages: [
      ...snapshot.copilotMessages,
      withMessage(
        'user',
        content,
      ),
    ].slice(-60),
  });
}

function addSystemMessage(
  content: string,
): void {
  apply({
    ...snapshot,
    copilotMessages: [
      ...snapshot.copilotMessages,
      withMessage(
        'system',
        content,
      ),
    ].slice(-60),
  });
}

async function refreshPendingAction(): Promise<void> {
  try {
    const pending =
      await window.djSync.copilotAction.getCurrent();

    const action =
      pending === null
        ? null
        : toProductionActionPreview(
            pending,
          );

    apply({
      ...snapshot,
      pendingAction: action,
    });
  } catch (error: unknown) {
    apply({
      ...snapshot,
      pendingAction: null,
      error:
        errorMessage(error),
    });
  }
}

async function refresh(): Promise<void> {
  try {
    const application =
      await window.djSync.application.refresh();

    applyApplicationSnapshot(
      application,
    );
  } catch (error: unknown) {
    apply({
      ...snapshot,
      connection:
        'disconnected',
      error:
        errorMessage(error),
    });
  }

  void refreshPendingAction();
}

async function sendMessage(
  message: string,
): Promise<void> {
  if (
    snapshot.busy
  ) {
    return;
  }

  addUserMessage(message);
  setBusy(true);
  setCopilot(
    'thinking',
    null,
  );

  try {
    const result =
      await window.djSync.copilot.chat({
        conversationId,
        message,
      });

    if (!result.ok) {
      throw new Error(
        result.error.message,
      );
    }

    addAssistantMessage(
      extractResponse(
        result.result,
      ),
    );

    setCopilot(
      'completed',
      null,
    );

    apply({
      ...snapshot,
      busy: false,
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Copilot responded',
          detail:
            'Conversation completed successfully.',
          status:
            'success',
        }),
      ].slice(-100),
    });
  } catch (error: unknown) {
    const messageText =
      errorMessage(error);

    addSystemMessage(
      `Copilot error: ${messageText}`,
    );

    apply({
      ...snapshot,
      copilot: 'error',
      busy: false,
      error: messageText,
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Copilot failed',
          detail:
            messageText,
          status:
            'error',
        }),
      ].slice(-100),
    });
  }
}

function extractResponse(
  value: unknown,
): string {
  if (
    value &&
    typeof value ===
      'object' &&
    'response' in value &&
    typeof value.response ===
      'string'
  ) {
    return value.response;
  }

  throw new Error(
    'Copilot returned an invalid response.',
  );
}

async function runSyncStart(): Promise<void> {
  setBusy(true);

  apply({
    ...snapshot,
    sync: 'starting',
    syncDetail:
      'Starting synchronization…',
  });

  try {
    const application =
      await window.djSync.application.start();

    applyApplicationSnapshot(
      application,
    );
  } catch (error: unknown) {
    apply({
      ...snapshot,
      sync: 'error',
      error:
        errorMessage(error),
    });
  } finally {
    setBusy(false);
  }
}

async function runSyncStop(): Promise<void> {
  setBusy(true);

  apply({
    ...snapshot,
    sync: 'stopping',
    syncDetail:
      'Stopping synchronization…',
  });

  try {
    const application =
      await window.djSync.application.stop();

    applyApplicationSnapshot(
      application,
    );
  } catch (error: unknown) {
    apply({
      ...snapshot,
      sync: 'error',
      error:
        errorMessage(error),
    });
  } finally {
    setBusy(false);
  }
}

function actionResultError(
  result: CopilotActionUiResult,
): void {
  if (!result.ok) {
    throw new Error(
      result.error ??
        'Copilot action operation failed.',
    );
  }
}

async function approveAction(
  actionId: string,
): Promise<void> {
  setBusy(true);
  setCopilot(
    'executing',
    null,
  );

  try {
    const result =
      await window.djSync.copilotAction.approve(
        actionId,
      );

    actionResultError(result);

    apply({
      ...snapshot,
      busy: false,
      pendingAction: null,
      copilot: 'completed',
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Action approved',
          detail:
            result.status ?? null,
          status:
            'success',
        }),
      ].slice(-100),
    });

    void refreshPendingAction();
  } catch (error: unknown) {
    apply({
      ...snapshot,
      busy: false,
      copilot: 'error',
      error:
        errorMessage(error),
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Action approval failed',
          detail:
            errorMessage(error),
          status:
            'error',
        }),
      ].slice(-100),
    });
  }
}

async function rejectAction(
  actionId: string,
): Promise<void> {
  setBusy(true);

  try {
    const result =
      await window.djSync.copilotAction.reject(
        actionId,
      );

    actionResultError(result);

    apply({
      ...snapshot,
      busy: false,
      pendingAction: null,
      copilot: 'completed',
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Action rejected',
          detail:
            result.status ?? null,
          status:
            'warning',
        }),
      ].slice(-100),
    });

    void refreshPendingAction();
  } catch (error: unknown) {
    apply({
      ...snapshot,
      busy: false,
      copilot: 'error',
      error:
        errorMessage(error),
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Action rejection failed',
          detail:
            errorMessage(error),
          status:
            'error',
        }),
      ].slice(-100),
    });
  }
}

function buildSettingsFloatingButton():
  void {
  let button =
    document.querySelector<
      HTMLButtonElement
    >(
      '#production-ui-settings-trigger',
    );

  if (button) {
    return;
  }

  button =
    document.createElement(
      'button',
    );

  button.type =
    'button';

  button.id =
    'production-ui-settings-trigger';

  button.setAttribute(
    'aria-label',
    'Open settings',
  );

  button.title =
    'Settings';

  Object.assign(
    button.style,
    {
      position:
        'fixed',
      top:
        '20px',
      right:
        '20px',
      width:
        '44px',
      height:
        '44px',
      borderRadius:
        '9999px',
      border:
        '1px solid #e5e7eb',
      background:
        '#ffffff',
      color:
        '#111827',
      fontSize:
        '20px',
      lineHeight:
        '42px',
      textAlign:
        'center',
      boxShadow:
        '0 4px 14px rgba(0,0,0,0.08)',
      cursor:
        'pointer',
      zIndex:
        '2147483000',
    } as CSSStyleDeclaration,
  );

  button.textContent =
    '⚙️';

  button.addEventListener(
    'click',
    () => {
      openSettingsPanel();
    },
  );

  document
    .body
    .appendChild(
      button,
    );
}

function closeSettingsPanel():
  void {
  settingsOpen =
    false;

  if (
    settingsPanel !==
    null
  ) {
    settingsPanel
      .remove();
    settingsPanel =
      null;
  }
}

function syncDraftFromInputs():
  void {
  if (
    settingsPanel ===
    null
  ) {
    return;
  }

  const read = (
    id: string,
  ): string =>
    (
      settingsPanel!.querySelector<
        HTMLInputElement | HTMLSelectElement
      >(
        `#${id}`,
      )
    )?.value?.trim() ??
    '';

  const readNumber = (
    id: string,
  ): number => {
    const raw =
      read(id);

    const parsed =
      Number(
        raw,
      );

    if (
      Number
        .isFinite(
          parsed,
        )
    ) {
      return parsed;
    }

    return draftSettings[
      id as keyof typeof draftSettings
    ] as number;
  };

  draftSettings =
    {
      syncAgentId:
        read(
          'setting-sync-agent-id',
        ),
      syncApiUrl:
        read(
          'setting-sync-api-url',
        ),
      syncApiKey:
        read(
          'setting-sync-api-key',
        ),
      rekordboxDbPath:
        read(
          'setting-rekordbox-db-path',
        ),
      rekordboxDbKey:
        read(
          'setting-rekordbox-db-key',
        ),
      rekordboxCipherCompatibility:
        (readNumber(
          'setting-rekordbox-cipher',
        ) as 1 | 2 | 3 | 4),
      copilotProvider:
        (read(
          'setting-copilot-provider',
        ) as
          | 'openai'
          | 'anthropic'
          | 'openai-compatible'),
      copilotApiKey:
        read(
          'setting-copilot-api-key',
        ),
      copilotBaseUrl:
        read(
          'setting-copilot-base-url',
        ),
      copilotModel:
        read(
          'setting-copilot-model',
        ),
      intelligenceJobsApiUrl:
        read(
          'setting-intelligence-api-url',
        ),
      logLevel:
        (read(
          'setting-log-level',
        ) as UserSettings['logLevel']) ??
        'info',
    };
}

function renderDraftIntoInputs():
  void {
  if (
    settingsPanel ===
    null
  ) {
    return;
  }

  const set = (
    id: string,
    value:
      | string
      | number,
  ): void => {
    const input =
      settingsPanel!.querySelector<
        HTMLInputElement | HTMLSelectElement
      >(
        `#${id}`,
      );

    if (
      input ===
      null
    ) {
      return;
    }

    input.value =
      String(
        value,
      );
  };

  set(
    'setting-sync-agent-id',
    draftSettings
      .syncAgentId ??
      '',
  );

  set(
    'setting-sync-api-url',
    draftSettings
      .syncApiUrl ??
      '',
  );

  set(
    'setting-sync-api-key',
    draftSettings
      .syncApiKey ??
      '',
  );

  set(
    'setting-rekordbox-db-path',
    draftSettings
      .rekordboxDbPath ??
      '',
  );

  set(
    'setting-rekordbox-db-key',
    draftSettings
      .rekordboxDbKey ??
      '',
  );

  set(
    'setting-rekordbox-cipher',
    draftSettings
      .rekordboxCipherCompatibility ??
      4,
  );

  set(
    'setting-copilot-provider',
    draftSettings
      .copilotProvider ??
      'openai',
  );

  set(
    'setting-copilot-api-key',
    draftSettings
      .copilotApiKey ??
      '',
  );

  set(
    'setting-copilot-base-url',
    draftSettings
      .copilotBaseUrl ??
      '',
  );

  set(
    'setting-copilot-model',
    draftSettings
      .copilotModel ??
      '',
  );

  set(
    'setting-intelligence-api-url',
    draftSettings
      .intelligenceJobsApiUrl ??
      '',
  );

  set(
    'setting-log-level',
    draftSettings
      .logLevel ??
      'info',
  );
}

function setSettingsSaveStatus(
  kind:
    | 'idle'
    | 'saving'
    | 'saved'
    | 'error',
  message?: string,
):
  void {
  if (
    settingsPanel ===
    null
  ) {
    return;
  }

  const status =
    settingsPanel.querySelector<
      HTMLElement
    >(
      '#settings-save-status',
    );

  if (
    status ===
    null
  ) {
    return;
  }

  const colorMap =
    {
      idle:
        '#6b7280',
      saving:
        '#6b7280',
      saved:
        '#16a34a',
      error:
        '#dc2626',
    } as const;

  status.style.color =
    colorMap[kind];

  switch (
    kind
  ) {
    case 'idle':
      status.textContent =
        message ??
        'Changes are saved locally in ~/.config/dj-sync-agent/settings.json (0600). Restart DJ Sync Agent to apply them completely.';
      break;
    case 'saving':
      status.textContent =
        message ??
        'Saving…';
      break;
    case 'saved':
      status.textContent =
        message ??
        '✓ Saved. Restart the app to apply all settings.';
      break;
    case 'error':
      status.textContent =
        message ??
        'Error saving.';
      break;
  }
}

function buildSettingsPanel():
  HTMLElement {
  if (
    settingsPanel !==
    null
  ) {
    return settingsPanel;
  }

  const panel =
    document.createElement(
      'div',
    );

  settingsPanel =
    panel;

  Object.assign(
    panel.style,
    {
      position:
        'fixed',
      inset:
        '0',
      backgroundColor:
        'rgba(17,24,39,0.5)',
      backdropFilter:
        'blur(4px)',
      display:
        'flex',
      alignItems:
        'flex-start',
      justifyContent:
        'center',
      paddingTop:
        '8vh',
      paddingBottom:
        '8vh',
      zIndex:
        '2147483500',
      overflowY:
        'auto',
    } as CSSStyleDeclaration,
  );

  const card =
    document.createElement(
      'div',
    );

  Object.assign(
    card.style,
    {
      width:
        '100%',
      maxWidth:
        '820px',
      background:
        '#ffffff',
      borderRadius:
        '16px',
      padding:
        '28px 32px 32px',
      boxShadow:
        '0 20px 60px rgba(0,0,0,0.25)',
      color:
        '#111827',
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      fontSize:
        '14px',
      lineHeight:
        '1.45',
    } as CSSStyleDeclaration,
  );

  card.innerHTML =
    String.raw`
<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px;">
  <div>
    <h1 style="margin:0; font-size:22px; font-weight:650; letter-spacing:-0.01em;">Settings</h1>
    <p style="margin:6px 0 0; color:#4b5563;">
      Configure here the DJ Sync Agent identifiers, Copilot provider and Rekordbox database location.
      Saved locally in <code style="padding:2px 6px; background:#f3f4f6; border-radius:6px;">~/.config/dj-sync-agent/settings.json</code>
      with file mode 0600.
    </p>
  </div>
  <button id="settings-close" type="button"
    style="border:none; background:transparent; font-size:22px; line-height:1; cursor:pointer; color:#6b7280; padding:4px 8px; border-radius:8px;"
    title="Close">×</button>
</div>

<form id="settings-form" autocomplete="off" spellcheck="false" style="display:grid; gap:22px;">
  <fieldset style="border:1px solid #e5e7eb; border-radius:12px; padding:18px 20px 20px;">
    <legend style="padding:0 8px; font-weight:600; color:#111827;">Sync</legend>
    <div style="display:grid; gap:14px; margin-top:6px;">
      <div>
        <label for="setting-sync-agent-id" style="display:block; font-weight:500; margin-bottom:6px;">SYNC_AGENT_ID</label>
        <input id="setting-sync-agent-id" name="syncAgentId" type="text" placeholder="device-abc123"
          style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
      </div>
      <div style="display:grid; grid-template-columns: 2fr 1.2fr; gap:14px;">
        <div>
          <label for="setting-sync-api-url" style="display:block; font-weight:500; margin-bottom:6px;">SYNC_API_URL (optional)</label>
          <input id="setting-sync-api-url" name="syncApiUrl" type="url" placeholder="https://..."
            style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
        </div>
        <div>
          <label for="setting-sync-api-key" style="display:block; font-weight:500; margin-bottom:6px;">SYNC_API_KEY (optional)</label>
          <input id="setting-sync-api-key" name="syncApiKey" type="password" autocomplete="new-password" placeholder="••••••"
            style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
        </div>
      </div>
    </div>
  </fieldset>

  <fieldset style="border:1px solid #e5e7eb; border-radius:12px; padding:18px 20px 20px;">
    <legend style="padding:0 8px; font-weight:600; color:#111827;">Rekordbox</legend>
    <div style="display:grid; gap:14px; margin-top:6px;">
      <div>
        <label for="setting-rekordbox-db-path" style="display:block; font-weight:500; margin-bottom:6px;">REKORDBOX_DB_PATH</label>
        <input id="setting-rekordbox-db-path" name="rekordboxDbPath" type="text"
          placeholder="~/Library/Pioneer/rekordbox/master.db"
          style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
      </div>
      <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:14px;">
        <div>
          <label for="setting-rekordbox-db-key" style="display:block; font-weight:500; margin-bottom:6px;">REKORDBOX_DB_KEY (optional)</label>
          <input id="setting-rekordbox-db-key" name="rekordboxDbKey" type="password" autocomplete="new-password" placeholder="••••••"
            style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
        </div>
        <div>
          <label for="setting-rekordbox-cipher" style="display:block; font-weight:500; margin-bottom:6px;">Cipher compatibility</label>
          <select id="setting-rekordbox-cipher" name="rekordboxCipherCompatibility"
            style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; background:#fff; font-size:14px;">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4" selected>4 (default)</option>
          </select>
        </div>
      </div>
    </div>
  </fieldset>

  <fieldset style="border:1px solid #e5e7eb; border-radius:12px; padding:18px 20px 20px;">
    <legend style="padding:0 8px; font-weight:600; color:#111827;">Copilot</legend>
    <div style="display:grid; gap:14px; margin-top:6px;">
      <div style="display:grid; grid-template-columns: 1fr 1.2fr; gap:14px;">
        <div>
          <label for="setting-copilot-provider" style="display:block; font-weight:500; margin-bottom:6px;">Provider</label>
          <select id="setting-copilot-provider" name="copilotProvider"
            style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; background:#fff; font-size:14px;">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai-compatible">OpenAI-compatible (OpenRouter, Ollama gateway, etc.)</option>
          </select>
        </div>
        <div>
          <label for="setting-copilot-model" style="display:block; font-weight:500; margin-bottom:6px;">Model</label>
          <input id="setting-copilot-model" name="copilotModel" type="text"
            placeholder="gpt-4o · claude-3-5-sonnet-latest · deepseek-chat · etc."
            style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
        </div>
      </div>
      <div>
        <label for="setting-copilot-api-key" style="display:block; font-weight:500; margin-bottom:6px;">COPILOT_API_KEY</label>
        <input id="setting-copilot-api-key" name="copilotApiKey" type="password" autocomplete="new-password" placeholder="sk-... · sk-ant-... · etc."
          style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
      </div>
      <div>
        <label for="setting-copilot-base-url" style="display:block; font-weight:500; margin-bottom:6px;">COPILOT_BASE_URL (optional)</label>
        <input id="setting-copilot-base-url" name="copilotBaseUrl" type="url" placeholder="https://api.openai.com/v1"
          style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
        <p style="margin:6px 2px 0; color:#6b7280; font-size:12.5px;">
          Only required for providers other than the official OpenAI or Anthropic endpoints.
        </p>
      </div>
    </div>
  </fieldset>

  <fieldset style="border:1px solid #e5e7eb; border-radius:12px; padding:18px 20px 20px;">
    <legend style="padding:0 8px; font-weight:600; color:#111827;">Advanced</legend>
    <div style="display:grid; gap:14px; margin-top:6px;">
      <div>
        <label for="setting-intelligence-api-url" style="display:block; font-weight:500; margin-bottom:6px;">INTELLIGENCE_JOBS_API_URL (optional)</label>
        <input id="setting-intelligence-api-url" name="intelligenceJobsApiUrl" type="url" placeholder="https://..."
          style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
      </div>
      <div>
        <label for="setting-log-level" style="display:block; font-weight:500; margin-bottom:6px;">LOG_LEVEL</label>
        <select id="setting-log-level" name="logLevel"
          style="width:100%; max-width:220px; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; background:#fff; font-size:14px;">
          <option value="fatal">fatal</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info" selected>info (default)</option>
          <option value="debug">debug</option>
          <option value="trace">trace</option>
        </select>
      </div>
    </div>
  </fieldset>

  <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:4px;">
    <div id="settings-save-status" style="color:#6b7280; font-size:13px; min-height:18px;"></div>
    <div style="display:flex; gap:10px;">
      <button id="settings-cancel" type="button"
        style="padding:9px 16px; border:1px solid #d1d5db; background:#fff; color:#111827; border-radius:8px; cursor:pointer; font-weight:500;">
        Cancel
      </button>
      <button id="settings-save" type="submit"
        style="padding:9px 18px; border:none; background:#111827; color:#fff; border-radius:8px; cursor:pointer; font-weight:600;">
        Save changes
      </button>
    </div>
  </div>
</form>
`;

  panel.appendChild(
    card,
  );

  const closeBtn =
    card.querySelector<
      HTMLButtonElement
    >(
      '#settings-close',
    );

  if (
    closeBtn !==
    null
  ) {
    closeBtn.addEventListener(
      'click',
      closeSettingsPanel,
    );
  }

  const cancelBtn =
    card.querySelector<
      HTMLButtonElement
    >(
      '#settings-cancel',
    );

  if (
    cancelBtn !==
    null
  ) {
    cancelBtn.addEventListener(
      'click',
      closeSettingsPanel,
    );
  }

  panel.addEventListener(
    'click',
    (event) => {
      if (
        event.target ===
        panel
      ) {
        closeSettingsPanel();
      }
    },
  );

  const form =
    card.querySelector<
      HTMLFormElement
    >(
      '#settings-form',
    );

  if (
    form !==
    null
  ) {
    form.addEventListener(
      'submit',
      async (
        event,
      ) => {
        event.preventDefault();

        syncDraftFromInputs();
        setSettingsSaveStatus(
          'saving',
          'Saving…',
        );

        try {
          const saved =
            await window
              .djSync
              .settings
              .save(
                {
                  ...draftSettings,
                },
              );

          draftSettings =
            {
              ...DRAFT_SETTINGS_DEFAULTS,
              ...saved,
            };

          renderDraftIntoInputs();

          apply({
            ...snapshot,
            activities: [
              ...snapshot.activities,
              withActivity({
                label:
                  'Settings saved',
                detail:
                  'Restart the application to apply the new configuration.',
                status:
                  'success',
              }),
            ].slice(
              -100,
            ),
          });

          setSettingsSaveStatus(
            'saved',
          );
        } catch (
          error: unknown
        ) {
          setSettingsSaveStatus(
            'error',
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
          );
        }
      },
    );
  }

  setSettingsSaveStatus(
    'idle',
  );

  return panel;
}

async function openSettingsPanel():
  Promise<void> {
  if (
    settingsOpen &&
    settingsPanel !==
      null
  ) {
    return;
  }

  settingsOpen =
    true;

  const stored =
    await window
      .djSync
      .settings
      .get()
      .catch(
        () =>
          ({} as UserSettings),
      );

  draftSettings =
    {
      ...DRAFT_SETTINGS_DEFAULTS,
      ...stored,
    };

  const panel =
    buildSettingsPanel();

  if (
    !document
      .body
      .contains(
        panel,
      )
  ) {
    document
      .body
      .appendChild(
        panel,
      );
  }

  renderDraftIntoInputs();
}

function installSettingsOverlay():
  void {
  buildSettingsFloatingButton();

  const openSettingsFromLanding =
    document.querySelector<
      HTMLButtonElement
    >(
      '#settings-open-button',
    );

  if (
    openSettingsFromLanding !==
    null
  ) {
    openSettingsFromLanding.addEventListener(
      'click',
      () => {
        void openSettingsPanel();
      },
    );
  }
}

const ui =
  mountProductionUi({
    root,
    initial:
      snapshot,
    callbacks: {
      onSendMessage:
        sendMessage,
      onApproveAction:
        approveAction,
      onRejectAction:
        rejectAction,
      onStartSync:
        runSyncStart,
      onStopSync:
        runSyncStop,
      onRefresh:
        refresh,
    },
  });

applyDsViewMode(
  activeView,
);

ensureViewModeObserver();

installNavigationController();

installSettingsOverlay();

function handleTrackSelected(
  event: Event,
): void {
  const detail =
    (event as CustomEvent).detail as unknown;

  if (!detail || typeof detail !== 'object') {
    return;
  }

  const candidate = detail as {
    identity?: { id?: unknown };
    metadata?: Record<string, unknown>;
    technical?: Record<string, unknown>;
  };

  if (
    typeof candidate.identity?.id !==
      'string'
  ) {
    return;
  }

  const track = toProductionTrack(
    detail as Parameters<
      typeof toProductionTrack
    >[0],
  );

  apply({
    ...snapshot,
    track,
  });
}

window.addEventListener(
  'dj-sync:track-selected',
  handleTrackSelected,
);

applicationSubscription =
  window.djSync.application.subscribe(
    (application) => {
      try {
        applyApplicationSnapshot(
          application,
        );
      } catch (error: unknown) {
        apply({
          ...snapshot,
          connection:
            'disconnected',
          error:
            errorMessage(error),
        });
      }
    },
  );

window.addEventListener(
  'beforeunload',
  () => {
    applicationSubscription?.();
    applicationSubscription =
      null;
    window.removeEventListener(
      'dj-sync:track-selected',
      handleTrackSelected,
    );
    ui.destroy();
  },
  { once: true },
);

async function refreshCopilotStatus(): Promise<void> {
  try {
    const status =
      await window.djSync.copilot.status();

    if (status.configured) {
      return;
    }

    apply({
      ...snapshot,
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Copilot is not configured',
          detail:
            'Configure the Copilot provider in the protected local environment.',
          status:
            'warning',
        }),
      ].slice(-100),
    });
  } catch (error: unknown) {
    apply({
      ...snapshot,
      activities: [
        ...snapshot.activities,
        withActivity({
          label:
            'Copilot status unavailable',
          detail:
            errorMessage(error),
          status:
            'warning',
        }),
      ].slice(-100),
    });
  }
}

void refreshCopilotStatus();
void refreshPendingAction();
void refresh();
