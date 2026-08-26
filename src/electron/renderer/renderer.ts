const connectionStatus =
  document.querySelector<HTMLElement>(
    '#connection-status',
  );

const runtimeStatus =
  document.querySelector<HTMLElement>(
    '#runtime-status',
  );

const runtimeSnapshot =
  document.querySelector<HTMLPreElement>(
    '#runtime-snapshot',
  );

const runtimeError =
  document.querySelector<HTMLElement>(
    '#runtime-error',
  );

const appInfo =
  document.querySelector<HTMLPreElement>(
    '#app-info',
  );

const startButton =
  document.querySelector<HTMLButtonElement>(
    '#start-runtime',
  );

const stopButton =
  document.querySelector<HTMLButtonElement>(
    '#stop-runtime',
  );

function setConnectionStatus(
  message: string,
): void {
  if (connectionStatus !== null) {
    connectionStatus.textContent =
      message;
  }
}

function renderSnapshot(
  snapshot: RuntimeSnapshot,
): void {
  if (runtimeStatus !== null) {
    runtimeStatus.textContent =
      snapshot.status;
  }

  if (runtimeError !== null) {
    const error = snapshot.lastError;

    runtimeError.textContent =
      typeof error === 'string'
        ? error
        : '';
  }

  if (runtimeSnapshot !== null) {
    const lastRun =
      snapshot.lastRun;

    if (
      lastRun === null ||
      lastRun === undefined
    ) {
      runtimeSnapshot.textContent =
        'No sync run yet.';
    } else {
      runtimeSnapshot.textContent =
        JSON.stringify(
          lastRun,
          null,
          2,
        );
    }
  }

  const status =
    snapshot.status;

  if (startButton !== null) {
    startButton.disabled =
      status === 'starting' ||
      status === 'running';
  }

  if (stopButton !== null) {
    stopButton.disabled =
      status === 'stopping' ||
      status === 'stopped';
  }
}

async function loadAppInfo(): Promise<void> {
  if (appInfo === null) {
    return;
  }

  try {
    const info =
      await window.djSync.getAppInfo();

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

async function loadInitialRuntimeStatus(): Promise<void> {
  try {
    const snapshot =
      await window.djSync.runtimeStatus();

    renderSnapshot(snapshot);

    setConnectionStatus(
      'Connected to Electron main process',
    );
  } catch (error) {
    setConnectionStatus(
      'Failed to connect to Electron main process',
    );

    if (runtimeError !== null) {
      runtimeError.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    }
  }
}

async function startRuntime(): Promise<void> {
  if (startButton !== null) {
    startButton.disabled = true;
  }

  try {
    const snapshot =
      await window.djSync.runtimeStart();

    renderSnapshot(snapshot);
  } catch (error) {
    if (runtimeError !== null) {
      runtimeError.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    }
  }
}

async function stopRuntime(): Promise<void> {
  if (stopButton !== null) {
    stopButton.disabled = true;
  }

  try {
    const snapshot =
      await window.djSync.runtimeStop();

    renderSnapshot(snapshot);
  } catch (error) {
    if (runtimeError !== null) {
      runtimeError.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    }
  }
}

function registerEventHandlers(): void {
  startButton?.addEventListener(
    'click',
    () => {
      void startRuntime();
    },
  );

  stopButton?.addEventListener(
    'click',
    () => {
      void stopRuntime();
    },
  );
}

function initialise(): void {
  registerEventHandlers();

  window.djSync.onRuntimeUpdate(
    (snapshot) => {
      renderSnapshot(snapshot);
      setConnectionStatus(
        'Connected to Electron main process',
      );
    },
  );

  void loadAppInfo();
  void loadInitialRuntimeStatus();
}

initialise();