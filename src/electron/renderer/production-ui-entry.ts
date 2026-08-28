import {
  createInitialProductionUiSnapshot,
  mountProductionUi,
} from './production-ui/index.js';

import type {
  DJSyncApplicationSnapshot,
  CopilotActionUiResult,
} from '../ipc/contracts.js';

import type {
  ProductionActivityItem,
  ProductionCopilotMessage,
  ProductionCopilotState,
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

type RendererView =
  | 'dashboard'
  | 'library'
  | 'audio'
  | 'copilot';

let activeView: RendererView =
  'dashboard';

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

  if (
    view === 'dashboard' ||
    view === 'copilot'
  ) {
    dashboardView?.classList.remove(
      'view-hidden',
    );

    libraryView?.classList.add(
      'view-hidden',
    );

    audioView?.classList.add(
      'view-hidden',
    );

    showProductionWorkspace(true);
  } else if (view === 'library') {
    dashboardView?.classList.add(
      'view-hidden',
    );

    libraryView?.classList.remove(
      'view-hidden',
    );

    audioView?.classList.add(
      'view-hidden',
    );

    showProductionWorkspace(false);
  } else {
    dashboardView?.classList.add(
      'view-hidden',
    );

    libraryView?.classList.add(
      'view-hidden',
    );

    audioView?.classList.remove(
      'view-hidden',
    );

    showProductionWorkspace(false);
  }

  syncNavigation(view);

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

function installNavigationController(): void {
  installCopilotNavigation();

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
        view !== 'copilot'
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

installNavigationController();

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
void refresh();
