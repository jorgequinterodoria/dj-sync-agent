import type {
  AudioAnalysisApplicationSnapshot,
} from '../ipc/contracts.js';

let selectedTrackId:
  string | null =
  null;

const nav =
  document.querySelector(
    '.main-nav',
  );

const dashboard =
  document.querySelector(
    '.dashboard',
  );

const libraryBody =
  document.querySelector(
    '#library-table-body',
  );

if (
  nav !== null &&
  dashboard !== null
) {
  const audioNav =
    document.createElement(
      'button',
    );

  audioNav.id =
    'nav-audio';

  audioNav.type =
    'button';

  audioNav.className =
    'nav-button';

  audioNav.textContent =
    'Audio';

  audioNav.dataset.view =
    'audio';

  nav.append(
    audioNav,
  );

  const audioView =
    document.createElement(
      'section',
    );

  audioView.id =
    'view-audio';

  audioView.className =
    'view-section view-hidden';

  audioView.innerHTML =
    `
      <section class="audio-header">
        <div>
          <div class="eyebrow">
            AUDIO ANALYSIS
          </div>

          <h2>
            Audio
          </h2>

          <p
            id="audio-track-subtitle"
            class="panel-subtitle"
          >
            Select a track from the Library.
          </p>
        </div>

        <button
          id="audio-open-library"
          class="button button-secondary"
          type="button"
        >
          Open Library
        </button>
      </section>

      <section class="audio-layout">
        <article
          class="panel audio-main-panel"
        >
          <div
            id="audio-empty"
            class="empty-state"
          >
            Select a track from the Library
            to inspect its audio asset.
          </div>

          <div
            id="audio-content"
            class="view-hidden"
          >
            <div class="audio-track-header">
              <div>
                <div
                  id="audio-track-title"
                  class="audio-track-title"
                >
                  —
                </div>

                <div
                  id="audio-track-path"
                  class="audio-track-path"
                >
                  —
                </div>
              </div>

              <span
                id="audio-status-badge"
                class="state-badge state-unknown"
              >
                Idle
              </span>
            </div>

            <div class="audio-actions">
              <button
                id="audio-analyze"
                class="button button-primary"
                type="button"
              >
                Analyze
              </button>

              <button
                id="audio-analyze-persist"
                class="button button-secondary"
                type="button"
              >
                Analyze & Persist
              </button>
            </div>

            <div
              id="audio-error"
              class="inline-error"
            ></div>

            <div class="audio-section">
              <div class="eyebrow">
                ASSET VERIFICATION
              </div>

              <div class="audio-grid">
                <div class="audio-metric">
                  <span>
                    Verified
                  </span>

                  <strong
                    id="audio-verified"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Size
                  </span>

                  <strong
                    id="audio-size"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Bytes read
                  </span>

                  <strong
                    id="audio-bytes-read"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Algorithm
                  </span>

                  <strong
                    id="audio-algorithm"
                  >
                    —
                  </strong>
                </div>
              </div>

              <div class="audio-detail-block">
                <span>
                  SHA-256
                </span>

                <code
                  id="audio-checksum"
                  class="audio-code"
                >
                  —
                </code>
              </div>
            </div>

            <div class="audio-section">
              <div class="eyebrow">
                ANALYSIS
              </div>

              <div class="audio-grid">
                <div class="audio-metric">
                  <span>
                    Duration
                  </span>

                  <strong
                    id="audio-duration"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Sample rate
                  </span>

                  <strong
                    id="audio-sample-rate"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Channels
                  </span>

                  <strong
                    id="audio-channels"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Bitrate
                  </span>

                  <strong
                    id="audio-bitrate"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Codec
                  </span>

                  <strong
                    id="audio-codec"
                  >
                    —
                  </strong>
                </div>
              </div>
            </div>

            <div class="audio-section">
              <div class="eyebrow">
                PERSISTENCE
              </div>

              <div class="audio-grid">
                <div class="audio-metric">
                  <span>
                    Configured
                  </span>

                  <strong
                    id="audio-persistence-configured"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Analysis run
                  </span>

                  <strong
                    id="audio-analysis-run-id"
                  >
                    —
                  </strong>
                </div>

                <div class="audio-metric">
                  <span>
                    Persisted features
                  </span>

                  <strong
                    id="audio-persisted-features"
                  >
                    —
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>
    `;

  dashboard.append(
    audioView,
  );

  const audioEmpty =
    document.querySelector<HTMLElement>(
      '#audio-empty',
    );

  const audioContent =
    document.querySelector<HTMLElement>(
      '#audio-content',
    );

  const audioSubtitle =
    document.querySelector<HTMLElement>(
      '#audio-track-subtitle',
    );

  const audioTrackTitle =
    document.querySelector<HTMLElement>(
      '#audio-track-title',
    );

  const audioTrackPath =
    document.querySelector<HTMLElement>(
      '#audio-track-path',
    );

  const audioStatusBadge =
    document.querySelector<HTMLElement>(
      '#audio-status-badge',
    );

  const audioVerified =
    document.querySelector<HTMLElement>(
      '#audio-verified',
    );

  const audioSize =
    document.querySelector<HTMLElement>(
      '#audio-size',
    );

  const audioBytesRead =
    document.querySelector<HTMLElement>(
      '#audio-bytes-read',
    );

  const audioAlgorithm =
    document.querySelector<HTMLElement>(
      '#audio-algorithm',
    );

  const audioChecksum =
    document.querySelector<HTMLElement>(
      '#audio-checksum',
    );

  const audioDuration =
    document.querySelector<HTMLElement>(
      '#audio-duration',
    );

  const audioSampleRate =
    document.querySelector<HTMLElement>(
      '#audio-sample-rate',
    );

  const audioChannels =
    document.querySelector<HTMLElement>(
      '#audio-channels',
    );

  const audioBitrate =
    document.querySelector<HTMLElement>(
      '#audio-bitrate',
    );

  const audioCodec =
    document.querySelector<HTMLElement>(
      '#audio-codec',
    );

  const audioPersistenceConfigured =
    document.querySelector<HTMLElement>(
      '#audio-persistence-configured',
    );

  const audioAnalysisRunId =
    document.querySelector<HTMLElement>(
      '#audio-analysis-run-id',
    );

  const audioPersistedFeatures =
    document.querySelector<HTMLElement>(
      '#audio-persisted-features',
    );

  const audioError =
    document.querySelector<HTMLElement>(
      '#audio-error',
    );

  const analyzeButton =
    document.querySelector<HTMLButtonElement>(
      '#audio-analyze',
    );

  const analyzePersistButton =
    document.querySelector<HTMLButtonElement>(
      '#audio-analyze-persist',
    );

  const openLibraryButton =
    document.querySelector<HTMLButtonElement>(
      '#audio-open-library',
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

  function formatBytes(
    value:
      number | null,
  ): string {
    if (
      value === null
    ) {
      return '—';
    }

    if (
      value < 1024
    ) {
      return `${value} B`;
    }

    if (
      value < 1024 * 1024
    ) {
      return `${(
        value / 1024
      ).toFixed(1)} KB`;
    }

    if (
      value <
      1024 * 1024 * 1024
    ) {
      return `${(
        value /
        (
          1024 * 1024
        )
      ).toFixed(2)} MB`;
    }

    return `${(
      value /
      (
        1024 *
        1024 *
        1024
      )
    ).toFixed(2)} GB`;
  }

  function formatDuration(
    value:
      number | null,
  ): string {
    if (
      value === null
    ) {
      return '—';
    }

    const minutes =
      Math.floor(
        value / 60,
      );

    const seconds =
      Math.floor(
        value % 60,
      );

    return `${minutes}:${String(
      seconds,
    ).padStart(
      2,
      '0',
    )}`;
  }

  function formatSampleRate(
    value:
      number | null,
  ): string {
    if (
      value === null
    ) {
      return '—';
    }

    return `${(
      value / 1000
    ).toFixed(1)} kHz`;
  }

  function formatBitrate(
    value:
      number | null,
  ): string {
    if (
      value === null
    ) {
      return '—';
    }

    return `${Math.round(
      value / 1000,
    )} kbps`;
  }

  function setBadge(
    label: string,
    status:
      | 'success'
      | 'warning'
      | 'danger'
      | 'unknown',
  ): void {
    if (
      audioStatusBadge ===
      null
    ) {
      return;
    }

    audioStatusBadge.textContent =
      label;

    audioStatusBadge.className =
      `state-badge state-${status}`;
  }

  function showView(
    view:
      | 'dashboard'
      | 'library'
      | 'audio',
  ): void {
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

    audioView.classList.toggle(
      'view-hidden',
      view !==
        'audio',
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

    audioNav.classList.toggle(
      'nav-active',
      view ===
        'audio',
    );
  }

  function setBusy(
    busy:
      boolean,
  ): void {
    if (
      analyzeButton !==
      null
    ) {
      analyzeButton.disabled =
        busy ||
        selectedTrackId ===
          null;
    }

    if (
      analyzePersistButton !==
      null
    ) {
      analyzePersistButton.disabled =
        busy ||
        selectedTrackId ===
          null;
    }
  }

  function renderStatus(
    snapshot:
      AudioAnalysisApplicationSnapshot,
  ): void {
    const completed =
      snapshot.status ===
        'completed';

    const failed =
      snapshot.status ===
        'failed';

    const processing =
      snapshot.status ===
        'verifying' ||
      snapshot.status ===
        'analyzing' ||
      snapshot.status ===
        'processing';

    setBadge(
      completed
        ? 'Completed'
        : failed
          ? 'Failed'
          : processing
            ? 'Processing'
            : 'Idle',
      completed
        ? 'success'
        : failed
          ? 'danger'
          : processing
            ? 'warning'
            : 'unknown',
    );

    setText(
      audioVerified,
      snapshot.verified
        ? 'Yes'
        : 'No',
    );

    setText(
      audioSize,
      formatBytes(
        snapshot.asset?.size ??
          null,
      ),
    );

    setText(
      audioBytesRead,
      formatBytes(
        snapshot.asset?.bytesRead ??
          null,
      ),
    );

    setText(
      audioAlgorithm,
      snapshot.asset
        ?.algorithm ??
        '—',
    );

    setText(
      audioChecksum,
      snapshot.asset
        ?.checksum ??
        '—',
    );

    setText(
      audioDuration,
      formatDuration(
        snapshot.analysis
          ?.durationSeconds ??
          null,
      ),
    );

    setText(
      audioSampleRate,
      formatSampleRate(
        snapshot.analysis
          ?.sampleRate ??
          null,
      ),
    );

    setText(
      audioChannels,
      snapshot.analysis
        ?.channels != null
        ? String(
            snapshot.analysis
              .channels,
          )
        : '—',
    );

    setText(
      audioBitrate,
      formatBitrate(
        snapshot.analysis
          ?.bitrate ??
          null,
      ),
    );

    setText(
      audioCodec,
      snapshot.analysis
        ?.codec ??
        '—',
    );

    setText(
      audioPersistenceConfigured,
      snapshot.persistenceConfigured
        ? 'Yes'
        : 'No',
    );

    setText(
      audioAnalysisRunId,
      snapshot.persistence
        ?.analysisRunId != null
        ? String(
            snapshot.persistence
              .analysisRunId,
          )
        : '—',
    );

    setText(
      audioPersistedFeatures,
      snapshot.persistence
        ?.persistedFeatures != null
        ? String(
            snapshot.persistence
              .persistedFeatures,
          )
        : '—',
    );

    setText(
      audioError,
      snapshot.error ??
        '',
    );

    setBusy(
      processing,
    );

    if (
      !snapshot.persistenceConfigured &&
      analyzePersistButton !==
        null
    ) {
      analyzePersistButton.title =
        'SYNC_AGENT_ID is not configured.';
    }
  }

  async function loadStatus():
    Promise<void> {
    if (
      selectedTrackId ===
      null
    ) {
      return;
    }

    try {
      const snapshot =
        await window.djSync
          .audio
          .status(
            selectedTrackId,
          );

      renderStatus(
        snapshot,
      );
    } catch (error) {
      setText(
        audioError,
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  async function selectTrack(
    trackId:
      string,
  ): Promise<void> {
    selectedTrackId =
      trackId;

    const track =
      await window.djSync
        .library
        .get(
          trackId,
        );

    setText(
      audioSubtitle,
      `${track.metadata.artist ?? 'Unknown artist'} · ${track.identity.id}`,
    );

    setText(
      audioTrackTitle,
      track.metadata.title ??
        'Untitled',
    );

    setText(
      audioTrackPath,
      track.primaryFile.localPath ??
        track.primaryFile.path ??
        'No audio file',
    );

    audioEmpty?.classList.add(
      'view-hidden',
    );

    audioContent?.classList.remove(
      'view-hidden',
    );

    setBusy(
      false,
    );

    await loadStatus();
  }

  async function runAnalyze():
    Promise<void> {
    if (
      selectedTrackId ===
      null
    ) {
      return;
    }

    setBusy(
      true,
    );

    try {
      setText(
        audioError,
        '',
      );

      const snapshot =
        await window.djSync
          .audio
          .analyze(
            selectedTrackId,
          );

      renderStatus(
        snapshot,
      );
    } catch (error) {
      setText(
        audioError,
        error instanceof Error
          ? error.message
          : String(error),
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function runAnalyzeAndPersist():
    Promise<void> {
    if (
      selectedTrackId ===
      null
    ) {
      return;
    }

    setBusy(
      true,
    );

    try {
      setText(
        audioError,
        '',
      );

      const snapshot =
        await window.djSync
          .audio
          .analyzeAndPersist(
            selectedTrackId,
          );

      renderStatus(
        snapshot,
      );
    } catch (error) {
      setText(
        audioError,
        error instanceof Error
          ? error.message
          : String(error),
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  libraryBody?.addEventListener(
    'click',
    async (
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

      const trigger =
        target.closest(
          '[data-track-id]',
        );

      if (
        !(trigger instanceof
          HTMLElement)
      ) {
        return;
      }

      const trackId =
        trigger.dataset
          .trackId;

      if (
        !trackId
      ) {
        return;
      }

      try {
        await selectTrack(
          trackId,
        );
      } catch (error) {
        setText(
          audioError,
          error instanceof Error
            ? error.message
            : String(error),
        );
      }
    },
  );

  audioNav.addEventListener(
    'click',
    () => {
      showView(
        'audio',
      );

      if (
        selectedTrackId ===
        null
      ) {
        return;
      }

      void loadStatus();
    },
  );

  navDashboard?.addEventListener(
    'click',
    () => {
      showView(
        'dashboard',
      );
    },
  );

  navLibrary?.addEventListener(
    'click',
    () => {
      showView(
        'library',
      );
    },
  );

  openLibraryButton?.addEventListener(
    'click',
    () => {
      showView(
        'library',
      );
    },
  );

  analyzeButton?.addEventListener(
    'click',
    () => {
      void runAnalyze();
    },
  );

  analyzePersistButton?.addEventListener(
    'click',
    () => {
      void runAnalyzeAndPersist();
    },
  );

  const style =
    document.createElement(
      'style',
    );

  style.textContent = `
    .audio-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 14px;
    }

    .audio-header h2 {
      margin: 5px 0 0;
      font-size: 26px;
      letter-spacing: -0.03em;
    }

    .audio-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
    }

    .audio-track-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
    }

    .audio-track-title {
      color: var(--text);
      font-size: 22px;
      font-weight: 750;
      letter-spacing: -0.02em;
    }

    .audio-track-path {
      margin-top: 7px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
      word-break: break-word;
    }

    .audio-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin-top: 18px;
    }

    .audio-section {
      margin-top: 24px;
      padding-top: 20px;
      border-top:
        1px solid
        rgba(148, 163, 184, 0.08);
    }

    .audio-grid {
      display: grid;
      grid-template-columns:
        repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }

    .audio-metric {
      padding: 14px;
      border:
        1px solid
        rgba(148, 163, 184, 0.08);
      border-radius: 11px;
      background:
        rgba(15, 23, 42, 0.5);
    }

    .audio-metric span,
    .audio-detail-block > span {
      display: block;
      color: var(--subtle);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .audio-metric strong {
      display: block;
      margin-top: 7px;
      color: var(--text);
      font-size: 15px;
      font-weight: 750;
    }

    .audio-detail-block {
      margin-top: 10px;
    }

    .audio-code {
      display: block;
      margin-top: 6px;
      padding: 10px 11px;
      border:
        1px solid
        rgba(148, 163, 184, 0.08);
      border-radius: 9px;
      background: var(--surface-strong);
      color: #cbd5e1;
      font-size: 10px;
      line-height: 1.5;
      word-break: break-all;
    }

    @media (max-width: 900px) {
      .audio-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 620px) {
      .audio-header {
        align-items: stretch;
        flex-direction: column;
      }

      .audio-actions {
        flex-direction: column;
      }

      .audio-actions .button {
        width: 100%;
      }

      .audio-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.append(
    style,
  );
}