import {
  formatBpm,
  formatConnection,
  formatCopilotState,
  formatKey,
  formatSyncState,
} from './production-ui-format.js';

import type {
  ProductionUiCallbacks,
  ProductionUiMountOptions,
  ProductionUiSnapshot,
} from './production-ui-types.js';

const STYLE_ID =
  'dj-sync-production-ui-styles';

const DEFAULT_AVATAR =
  'AI';

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

function renderTrack(
  snapshot:
    ProductionUiSnapshot,
): string {
  const track =
    snapshot.track;

  if (!track) {
    return `
      <section
        class="ds-card ds-now-playing"
        aria-labelledby="ds-now-playing-title"
      >
        <div class="ds-card-header">
          <div>
            <span class="ds-eyebrow">NOW PLAYING</span>
            <h2
              id="ds-now-playing-title"
              class="ds-card-title"
            >
              No track selected
            </h2>
          </div>
          <span class="ds-status-dot ds-status-dot-muted"
            aria-hidden="true"
          ></span>
        </div>

        <div class="ds-track-empty">
          <div class="ds-track-art ds-track-art-empty">
            ${DEFAULT_AVATAR}
          </div>

          <div>
            <p class="ds-muted">
              Select a track in the library or start
              a playback session to populate live DJ context.
            </p>
          </div>
        </div>
      </section>
    `;
  }

  const artwork =
    track.artworkUrl
      ? `
        <img
          class="ds-track-art"
          src="${escapeHtml(
            track.artworkUrl,
          )}"
          alt=""
        />
      `
      : `
        <div
          class="ds-track-art ds-track-art-empty"
          aria-hidden="true"
        >
          ${escapeHtml(
            track.artist
              .slice(0, 2)
              .toUpperCase(),
          )}
        </div>
      `;

  return `
    <section
      class="ds-card ds-now-playing"
      aria-labelledby="ds-now-playing-title"
    >
      <div class="ds-card-header">
        <div>
          <span class="ds-eyebrow">NOW PLAYING</span>
          <h2
            id="ds-now-playing-title"
            class="ds-card-title"
          >
            ${escapeHtml(
              track.title,
            )}
          </h2>
          <p class="ds-subtitle">
            ${escapeHtml(
              track.artist,
            )}
          </p>
        </div>

        <span
          class="ds-status-pill ds-status-pill-success"
        >
          LIVE
        </span>
      </div>

      <div class="ds-track-row">
        ${artwork}

        <div class="ds-track-meta">
          <div class="ds-track-stat">
            <span>BPM</span>
            <strong>
              ${escapeHtml(
                formatBpm(
                  track.bpm,
                ),
              )}
            </strong>
          </div>

          <div class="ds-track-stat">
            <span>KEY</span>
            <strong>
              ${escapeHtml(
                formatKey(
                  track.key,
                ),
              )}
            </strong>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAction(
  snapshot:
    ProductionUiSnapshot,
): string {
  const action =
    snapshot.pendingAction;

  if (!action || action.status !== 'pending') {
    return '';
  }

  const disabled =
    snapshot.busy
      ? 'disabled'
      : '';

  return `
    <section
      class="ds-card ds-action-card ds-action-card-${action.risk}"
      aria-labelledby="ds-action-title"
      data-action-id="${escapeHtml(action.id)}"
    >
      <div class="ds-card-header">
        <div>
          <span class="ds-eyebrow">
            ACTION REQUIRES APPROVAL
          </span>

          <h2
            id="ds-action-title"
            class="ds-card-title"
          >
            ${escapeHtml(
              action.title,
            )}
          </h2>
        </div>

        <span class="ds-risk-badge">
          ${escapeHtml(
            action.risk.toUpperCase(),
          )}
        </span>
      </div>

      <p class="ds-action-description">
        ${escapeHtml(
          action.description,
        )}
      </p>

      <div class="ds-resource-list">
        ${action.affectedResources
          .map(
            (
              resource,
            ) => `
              <span class="ds-resource-chip">
                ${escapeHtml(
                  resource,
                )}
              </span>
            `,
          )
          .join('')}
      </div>

      <p class="ds-action-safety">
        ${
          action.reversible
            ? 'This action is reversible.'
            : 'Review this action carefully before approving it.'
        }
      </p>

      <div class="ds-action-buttons">
        <button
          type="button"
          class="ds-button ds-button-secondary"
          data-action="reject"
          ${disabled}
        >
          Reject
        </button>

        <button
          type="button"
          class="ds-button ds-button-primary"
          data-action="approve"
          ${disabled}
        >
          Approve
        </button>
      </div>
    </section>
  `;
}

function renderMessages(
  snapshot:
    ProductionUiSnapshot,
): string {
  if (
    snapshot.copilotMessages.length ===
    0
  ) {
    return `
      <div
        class="ds-empty-state"
        aria-live="polite"
      >
        <div class="ds-empty-icon">
          ✦
        </div>
        <strong>
          Ask Copilot about your library.
        </strong>
        <span>
          Search tracks, analyze a set, or prepare
          a DJ action for approval.
        </span>
      </div>
    `;
  }

  return snapshot.copilotMessages
    .map(
      (message) => `
        <article
          class="ds-message ds-message-${message.role}"
        >
          <div class="ds-message-avatar">
            ${
              message.role ===
              'assistant'
                ? 'AI'
                : message.role ===
                    'system'
                  ? '•'
                  : 'YOU'
            }
          </div>

          <div class="ds-message-body">
            <div class="ds-message-role">
              ${
                message.role ===
                'assistant'
                  ? 'DJ Copilot'
                  : message.role ===
                      'system'
                    ? 'System'
                    : 'You'
              }
            </div>

            <div class="ds-message-content">
              ${escapeHtml(
                message.content,
              )}
            </div>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderActivities(
  snapshot:
    ProductionUiSnapshot,
): string {
  if (
    snapshot.activities.length ===
    0
  ) {
    return `
      <div class="ds-muted">
        No recent activity.
      </div>
    `;
  }

  return snapshot.activities
    .slice()
    .reverse()
    .slice(0, 12)
    .map(
      (item) => `
        <div class="ds-activity-item">
          <span
            class="ds-activity-indicator ds-activity-${item.status}"
            aria-hidden="true"
          ></span>

          <div class="ds-activity-body">
            <strong>
              ${escapeHtml(
                item.label,
              )}
            </strong>

            ${
              item.detail
                ? `<span>${escapeHtml(item.detail)}</span>`
                : ''
            }
          </div>

          <time>
            ${escapeHtml(
              item.timestamp,
            )}
          </time>
        </div>
      `,
    )
    .join('');
}

function renderSyncControls(
  snapshot:
    ProductionUiSnapshot,
): string {
  const running =
    snapshot.sync ===
    'running' ||
    snapshot.sync ===
    'starting';

  const stopping =
    snapshot.sync ===
    'stopping';

  return `
    <div class="ds-sync-controls">
      <button
        type="button"
        class="ds-button ds-button-secondary"
        data-action="refresh"
        ${snapshot.busy ? 'disabled' : ''}
      >
        Refresh
      </button>

      ${
        running || stopping
          ? `
            <button
              type="button"
              class="ds-button ds-button-secondary"
              data-action="stop-sync"
              ${snapshot.busy || stopping ? 'disabled' : ''}
            >
              Stop
            </button>
          `
          : `
            <button
              type="button"
              class="ds-button ds-button-primary"
              data-action="start-sync"
              ${snapshot.busy ? 'disabled' : ''}
            >
              Start Sync
            </button>
          `
      }
    </div>
  `;
}

function renderShell(
  snapshot:
    ProductionUiSnapshot,
): string {
  return `
    <div class="ds-shell">
      <header class="ds-topbar">
        <div class="ds-brand">
          <div class="ds-brand-mark">
            DS
          </div>

          <div>
            <strong>
              DJ Sync
            </strong>

            <span>
              Intelligent DJ workspace
            </span>
          </div>
        </div>

        <div class="ds-topbar-status">
          <span
            class="ds-status-pill ds-status-pill-${
              snapshot.connection
            }"
          >
            <span
              class="ds-status-dot"
              aria-hidden="true"
            ></span>

            ${escapeHtml(
              formatConnection(
                snapshot.connection,
              ),
            )}
          </span>

          <button
            type="button"
            class="ds-icon-button"
            data-action="refresh"
            aria-label="Refresh workspace"
            title="Refresh workspace"
            ${
              snapshot.busy
                ? 'disabled'
                : ''
            }
          >
            ↻
          </button>
        </div>
      </header>

      <main class="ds-main">
        <section
          class="ds-page-heading"
          aria-labelledby="ds-page-title"
        >
          <div>
            <span class="ds-eyebrow">
              DJ WORKSPACE
            </span>

            <h1 id="ds-page-title">
              Perform with context.
            </h1>

            <p>
              Your library, sync state and Copilot
              actions in one place.
            </p>
          </div>

          <div class="ds-sync-summary">
            <span class="ds-sync-label">
              Sync
            </span>

            <strong>
              ${escapeHtml(
                formatSyncState(
                  snapshot.sync,
                ),
              )}
            </strong>

            <span>
              ${escapeHtml(
                snapshot.syncDetail,
              )}
            </span>

            ${renderSyncControls(
              snapshot,
            )}
          </div>
        </section>

        ${
          snapshot.error
            ? `
              <div
                class="ds-error-banner"
                role="alert"
              >
                <strong>
                  Something needs attention
                </strong>

                <span>
                  ${escapeHtml(
                    snapshot.error,
                  )}
                </span>
              </div>
            `
            : ''
        }

        <div class="ds-layout">
          <div class="ds-primary-column">
            ${renderTrack(
              snapshot,
            )}

            <section
              class="ds-card ds-copilot-card"
              aria-labelledby="ds-copilot-title"
            >
              <div class="ds-card-header">
                <div>
                  <span class="ds-eyebrow">
                    COPILOT
                  </span>

                  <h2
                    id="ds-copilot-title"
                    class="ds-card-title"
                  >
                    ${escapeHtml(
                      formatCopilotState(
                        snapshot.copilot,
                      ),
                    )}
                  </h2>
                </div>

                <span
                  class="ds-status-pill ds-status-pill-neutral"
                >
                  AI
                </span>
              </div>

              <div
                class="ds-message-list"
                aria-live="polite"
                aria-relevant="additions text"
              >
                ${renderMessages(
                  snapshot,
                )}
              </div>

              <form
                class="ds-composer"
                data-role="composer"
              >
                <label
                  class="ds-sr-only"
                  for="ds-copilot-input"
                >
                  Ask DJ Copilot
                </label>

                <textarea
                  id="ds-copilot-input"
                  name="message"
                  rows="2"
                  maxlength="2000"
                  placeholder="Ask Copilot to find tracks, analyze a set, or prepare an action…"
                  ${
                    snapshot.busy
                      ? 'disabled'
                      : ''
                  }
                ></textarea>

                <div class="ds-composer-footer">
                  <span class="ds-composer-hint">
                    Enter to send · Shift+Enter for a new line
                  </span>

                  <button
                    type="submit"
                    class="ds-button ds-button-primary"
                    ${
                      snapshot.busy
                        ? 'disabled'
                        : ''
                    }
                  >
                    Send
                  </button>
                </div>
              </form>
            </section>

            ${renderAction(
              snapshot,
            )}
          </div>

          <aside class="ds-secondary-column">
            <section
              class="ds-card"
              aria-labelledby="ds-activity-title"
            >
              <div class="ds-card-header">
                <div>
                  <span class="ds-eyebrow">
                    ACTIVITY
                  </span>

                  <h2
                    id="ds-activity-title"
                    class="ds-card-title"
                  >
                    Recent events
                  </h2>
                </div>
              </div>

              <div class="ds-activity-list">
                ${renderActivities(
                  snapshot,
                )}
              </div>
            </section>

            <section class="ds-card ds-status-card">
              <span class="ds-eyebrow">
                WORKSPACE
              </span>

              <div class="ds-status-grid">
                <div>
                  <span>Connection</span>
                  <strong>
                    ${escapeHtml(
                      formatConnection(
                        snapshot.connection,
                      ),
                    )}
                  </strong>
                </div>

                <div>
                  <span>Sync</span>
                  <strong>
                    ${escapeHtml(
                      formatSyncState(
                        snapshot.sync,
                      ),
                    )}
                  </strong>
                </div>

                <div>
                  <span>Copilot</span>
                  <strong>
                    ${escapeHtml(
                      formatCopilotState(
                        snapshot.copilot,
                      ),
                    )}
                  </strong>
                </div>

                <div>
                  <span>Approval</span>
                  <strong>
                    ${
                      snapshot.pendingAction
                        ? 'Required'
                        : 'None'
                    }
                  </strong>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  `;
}

function installStyles(): void {
  if (
    document.getElementById(
      STYLE_ID,
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      'style',
    );

  style.id =
    STYLE_ID;

  style.textContent = `
    :root {
      color-scheme: dark;
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

      --ds-bg:
        #080b12;

      --ds-surface:
        #10151f;

      --ds-surface-raised:
        #151c29;

      --ds-border:
        rgba(255,255,255,.09);

      --ds-border-strong:
        rgba(255,255,255,.14);

      --ds-text:
        #f4f7fb;

      --ds-text-soft:
        #aab4c3;

      --ds-text-muted:
        #758093;

      --ds-accent:
        #7c9cff;

      --ds-success:
        #4fd1a5;

      --ds-warning:
        #e9bd69;

      --ds-danger:
        #ee7b87;

      --ds-radius:
        18px;

      --ds-shadow:
        0 20px 60px
        rgba(0,0,0,.25);
    }

    .ds-shell {
      min-height: 100vh;
      background:
        radial-gradient(
          1200px 600px at 70% -10%,
          rgba(124,156,255,.13),
          transparent 65%
        ),
        var(--ds-bg);
      color: var(--ds-text);
    }

    .ds-topbar {
      position: sticky;
      top: 0;
      z-index: 20;

      display: flex;
      align-items: center;
      justify-content: space-between;

      min-height: 72px;
      padding: 12px 28px;

      border-bottom:
        1px solid var(--ds-border);

      background:
        rgba(8,11,18,.88);

      backdrop-filter:
        blur(20px);
    }

    .ds-brand,
    .ds-topbar-status,
    .ds-sync-controls,
    .ds-action-buttons,
    .ds-track-row,
    .ds-composer-footer {
      display: flex;
      align-items: center;
    }

    .ds-brand {
      gap: 12px;
    }

    .ds-brand-mark {
      display: grid;
      place-items: center;

      width: 38px;
      height: 38px;

      border-radius: 11px;

      background:
        linear-gradient(
          135deg,
          rgba(124,156,255,.95),
          rgba(79,209,165,.85)
        );

      color: #071019;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .08em;
    }

    .ds-brand strong,
    .ds-brand span {
      display: block;
    }

    .ds-brand strong {
      font-size: 14px;
    }

    .ds-brand span {
      margin-top: 2px;
      color: var(--ds-text-muted);
      font-size: 11px;
    }

    .ds-topbar-status {
      gap: 10px;
    }

    .ds-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;

      min-height: 30px;
      padding: 0 10px;

      border:
        1px solid var(--ds-border);

      border-radius: 999px;

      background:
        rgba(255,255,255,.035);

      color: var(--ds-text-soft);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .02em;
    }

    .ds-status-pill-connected,
    .ds-status-pill-success {
      color: var(--ds-success);
    }

    .ds-status-pill-disconnected {
      color: var(--ds-danger);
    }

    .ds-status-pill-degraded {
      color: var(--ds-warning);
    }

    .ds-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      box-shadow:
        0 0 12px currentColor;
    }

    .ds-status-dot-muted {
      color: var(--ds-text-muted);
      box-shadow: none;
    }

    .ds-icon-button {
      display: grid;
      place-items: center;

      width: 32px;
      height: 32px;

      border:
        1px solid var(--ds-border);

      border-radius: 10px;

      background:
        rgba(255,255,255,.025);

      color: var(--ds-text-soft);

      cursor: pointer;
    }

    .ds-icon-button:hover {
      color: var(--ds-text);
      border-color:
        var(--ds-border-strong);
    }

    .ds-main {
      width:
        min(
          1440px,
          calc(100% - 40px)
        );

      margin: 0 auto;
      padding: 36px 0 56px;
    }

    .ds-page-heading {
      display: flex;
      justify-content: space-between;
      gap: 28px;
      margin-bottom: 26px;
    }

    .ds-page-heading h1 {
      margin: 7px 0 8px;
      font-size:
        clamp(30px, 4vw, 48px);
      line-height: 1.05;
      letter-spacing: -.04em;
    }

    .ds-page-heading p {
      max-width: 680px;
      margin: 0;
      color: var(--ds-text-soft);
      line-height: 1.6;
    }

    .ds-eyebrow {
      color: var(--ds-text-muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .15em;
    }

    .ds-sync-summary {
      min-width: 270px;
      padding: 18px;

      border:
        1px solid var(--ds-border);

      border-radius:
        var(--ds-radius);

      background:
        linear-gradient(
          180deg,
          rgba(255,255,255,.04),
          rgba(255,255,255,.018)
        );

      box-shadow: var(--ds-shadow);
    }

    .ds-sync-summary > span,
    .ds-sync-summary > strong {
      display: block;
    }

    .ds-sync-label {
      color: var(--ds-text-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .12em;
    }

    .ds-sync-summary strong {
      margin: 5px 0;
      font-size: 22px;
      letter-spacing: -.02em;
    }

    .ds-sync-summary > span:last-of-type {
      margin-bottom: 14px;
      color: var(--ds-text-soft);
      font-size: 12px;
      line-height: 1.45;
    }

    .ds-layout {
      display: grid;
      grid-template-columns:
        minmax(0, 1.7fr)
        minmax(300px, .8fr);
      gap: 20px;
      align-items: start;
    }

    .ds-primary-column,
    .ds-secondary-column {
      display: grid;
      gap: 20px;
      min-width: 0;
    }

    .ds-card {
      overflow: hidden;
      padding: 20px;

      border:
        1px solid var(--ds-border);

      border-radius:
        var(--ds-radius);

      background:
        linear-gradient(
          180deg,
          rgba(255,255,255,.035),
          rgba(255,255,255,.018)
        );

      box-shadow:
        0 18px 60px
        rgba(0,0,0,.2);
    }

    .ds-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    .ds-card-title {
      margin: 5px 0 0;
      font-size: 20px;
      letter-spacing: -.025em;
    }

    .ds-subtitle {
      margin: 4px 0 0;
      color: var(--ds-text-soft);
      font-size: 13px;
    }

    .ds-muted {
      color: var(--ds-text-muted);
      font-size: 12px;
      line-height: 1.55;
    }

    .ds-track-row {
      gap: 16px;
    }

    .ds-track-art {
      flex: 0 0 auto;
      width: 92px;
      height: 92px;
      object-fit: cover;
      border-radius: 14px;
      border:
        1px solid var(--ds-border);
      background:
        linear-gradient(
          135deg,
          rgba(124,156,255,.25),
          rgba(79,209,165,.08)
        );
    }

    .ds-track-art-empty {
      display: grid;
      place-items: center;
      color: var(--ds-text);
      font-size: 15px;
      font-weight: 800;
    }

    .ds-track-meta {
      display: grid;
      grid-template-columns:
        repeat(2, minmax(100px, 1fr));
      gap: 10px;
      flex: 1;
    }

    .ds-track-stat {
      padding: 12px 14px;
      border:
        1px solid var(--ds-border);
      border-radius: 12px;
      background:
        rgba(255,255,255,.02);
    }

    .ds-track-stat span,
    .ds-track-stat strong {
      display: block;
    }

    .ds-track-stat span {
      color: var(--ds-text-muted);
      font-size: 10px;
      letter-spacing: .1em;
    }

    .ds-track-stat strong {
      margin-top: 5px;
      font-size: 16px;
    }

    .ds-message-list {
      display: grid;
      gap: 16px;
      min-height: 160px;
      max-height: 520px;
      overflow: auto;
      padding-right: 4px;
    }

    .ds-message {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    .ds-message-avatar {
      display: grid;
      place-items: center;

      flex: 0 0 auto;

      width: 30px;
      height: 30px;

      border-radius: 9px;

      background:
        rgba(255,255,255,.05);

      color: var(--ds-text-soft);
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .06em;
    }

    .ds-message-assistant .ds-message-avatar {
      background:
        rgba(124,156,255,.14);
      color: var(--ds-accent);
    }

    .ds-message-body {
      min-width: 0;
    }

    .ds-message-role {
      margin-bottom: 3px;
      color: var(--ds-text-muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .ds-message-content {
      color: var(--ds-text-soft);
      font-size: 13px;
      line-height: 1.62;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .ds-composer {
      margin-top: 20px;
      padding-top: 16px;
      border-top:
        1px solid var(--ds-border);
    }

    .ds-composer textarea {
      width: 100%;
      resize: vertical;
      min-height: 74px;

      padding: 13px 14px;

      border:
        1px solid var(--ds-border);

      border-radius: 14px;

      outline: none;

      background:
        rgba(255,255,255,.025);

      color: var(--ds-text);
      font: inherit;
      font-size: 13px;
      line-height: 1.5;
    }

    .ds-composer textarea:focus {
      border-color:
        rgba(124,156,255,.55);

      box-shadow:
        0 0 0 3px
        rgba(124,156,255,.10);
    }

    .ds-composer-footer {
      justify-content: space-between;
      gap: 12px;
      margin-top: 10px;
    }

    .ds-composer-hint {
      color: var(--ds-text-muted);
      font-size: 10px;
    }

    .ds-button {
      min-height: 36px;
      padding: 0 14px;

      border:
        1px solid transparent;

      border-radius: 10px;

      font: inherit;
      font-size: 12px;
      font-weight: 800;

      cursor: pointer;
      transition:
        transform .15s ease,
        opacity .15s ease,
        border-color .15s ease,
        background .15s ease;
    }

    .ds-button:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .ds-button:disabled {
      cursor: not-allowed;
      opacity: .45;
    }

    .ds-button-primary {
      border-color:
        rgba(124,156,255,.35);

      background:
        rgba(124,156,255,.16);

      color: #dce5ff;
    }

    .ds-button-secondary {
      border-color:
        var(--ds-border);

      background:
        rgba(255,255,255,.03);

      color: var(--ds-text-soft);
    }

    .ds-action-card-write {
      border-color:
        rgba(124,156,255,.32);
    }

    .ds-action-card-review {
      border-color:
        rgba(233,189,105,.38);
    }

    .ds-risk-badge,
    .ds-status-pill-success {
      color: var(--ds-success);
    }

    .ds-risk-badge {
      padding: 5px 8px;
      border:
        1px solid rgba(233,189,105,.25);
      border-radius: 999px;
      background:
        rgba(233,189,105,.08);
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .1em;
    }

    .ds-action-description {
      margin: 0;
      color: var(--ds-text-soft);
      font-size: 13px;
      line-height: 1.6;
    }

    .ds-resource-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }

    .ds-resource-chip {
      padding: 5px 8px;
      border:
        1px solid var(--ds-border);
      border-radius: 999px;
      color: var(--ds-text-muted);
      font-size: 10px;
    }

    .ds-action-safety {
      margin: 14px 0 0;
      color: var(--ds-text-muted);
      font-size: 11px;
    }

    .ds-action-buttons {
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }

    .ds-activity-list {
      display: grid;
      gap: 12px;
    }

    .ds-activity-item {
      display: grid;
      grid-template-columns:
        auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
    }

    .ds-activity-indicator {
      width: 7px;
      height: 7px;
      margin-top: 5px;
      border-radius: 50%;
      background: var(--ds-text-muted);
    }

    .ds-activity-success {
      background: var(--ds-success);
    }

    .ds-activity-warning {
      background: var(--ds-warning);
    }

    .ds-activity-error {
      background: var(--ds-danger);
    }

    .ds-activity-body strong,
    .ds-activity-body span {
      display: block;
    }

    .ds-activity-body strong {
      color: var(--ds-text-soft);
      font-size: 11px;
    }

    .ds-activity-body span {
      margin-top: 2px;
      color: var(--ds-text-muted);
      font-size: 10px;
      line-height: 1.4;
    }

    .ds-activity-item time {
      color: var(--ds-text-muted);
      font-size: 9px;
      white-space: nowrap;
    }

    .ds-status-card {
      padding-bottom: 8px;
    }

    .ds-status-grid {
      display: grid;
      grid-template-columns:
        repeat(2, minmax(0,1fr));
      gap: 9px;
      margin-top: 16px;
    }

    .ds-status-grid > div {
      padding: 12px;
      border:
        1px solid var(--ds-border);
      border-radius: 12px;
      background:
        rgba(255,255,255,.02);
    }

    .ds-status-grid span,
    .ds-status-grid strong {
      display: block;
    }

    .ds-status-grid span {
      color: var(--ds-text-muted);
      font-size: 9px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .ds-status-grid strong {
      margin-top: 5px;
      font-size: 12px;
    }

    .ds-empty-state {
      display: grid;
      place-items: center;
      gap: 7px;
      min-height: 155px;
      text-align: center;
      color: var(--ds-text-muted);
    }

    .ds-empty-state strong {
      color: var(--ds-text-soft);
      font-size: 13px;
    }

    .ds-empty-state span {
      max-width: 340px;
      font-size: 11px;
      line-height: 1.5;
    }

    .ds-empty-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background:
        rgba(124,156,255,.12);
      color: var(--ds-accent);
    }

    .ds-error-banner {
      display: flex;
      gap: 8px;
      align-items: baseline;
      margin-bottom: 20px;
      padding: 12px 14px;
      border:
        1px solid rgba(238,123,135,.25);
      border-radius: 12px;
      background:
        rgba(238,123,135,.07);
      color: var(--ds-text-soft);
      font-size: 12px;
    }

    .ds-error-banner strong {
      color: var(--ds-danger);
    }

    .ds-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap;
      border: 0;
    }

    @media (max-width: 1000px) {
      .ds-page-heading {
        flex-direction: column;
      }

      .ds-sync-summary {
        min-width: 0;
      }

      .ds-layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .ds-topbar {
        padding: 10px 14px;
      }

      .ds-main {
        width:
          min(
            100% - 24px,
            720px
          );
        padding-top: 24px;
      }

      .ds-card {
        padding: 16px;
      }

      .ds-track-meta {
        grid-template-columns: 1fr;
      }

      .ds-composer-footer {
        align-items: flex-end;
        flex-direction: column;
      }

      .ds-action-buttons,
      .ds-sync-controls {
        width: 100%;
      }

      .ds-action-buttons .ds-button,
      .ds-sync-controls .ds-button {
        flex: 1;
      }

      .ds-page-heading h1 {
        font-size: 34px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ds-button {
        transition: none;
      }
    }
  `;

  document.head.appendChild(
    style,
  );
}

export interface ProductionUiHandle {
  update(
    snapshot: ProductionUiSnapshot,
  ): void;

  destroy(): void;
}

export function mountProductionUi(
  options: ProductionUiMountOptions,
): ProductionUiHandle {
  installStyles();

  let current =
    options.initial;

  let destroyed = false;

  const render =
    () => {
      if (
        destroyed
      ) {
        return;
      }

      options.root.innerHTML =
        renderShell(
          current,
        );

      wireEvents(
        options.root,
        options.callbacks,
      );

      const composer =
        options.root.querySelector<
          HTMLTextAreaElement
        >(
          '#ds-copilot-input',
        );

      composer?.focus({
        preventScroll:
          true,
      });
    };

  render();

  return {
    update(
      snapshot,
    ) {
      current =
        snapshot;

      render();
    },

    destroy() {
      destroyed =
        true;

      options.root.innerHTML =
        '';
    },
  };
}

function wireEvents(
  root: HTMLElement,
  callbacks:
    ProductionUiCallbacks,
): void {
  root
    .querySelectorAll<
      HTMLButtonElement
    >(
      '[data-action]',
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          () => {
            const action =
              button.dataset.action;

            if (
              action ===
              'approve'
            ) {
              const actionId =
                root
                  .querySelector<
                    HTMLElement
                  >(
                    '.ds-action-card',
                  )
                  ?.getAttribute(
                    'data-action-id',
                  );

              if (
                actionId
              ) {
                void callbacks
                  .onApproveAction(
                    actionId,
                  );
              }
            }

            if (
              action ===
              'reject'
            ) {
              const actionId =
                root
                  .querySelector<
                    HTMLElement
                  >(
                    '.ds-action-card',
                  )
                  ?.getAttribute(
                    'data-action-id',
                  );

              if (
                actionId
              ) {
                void callbacks
                  .onRejectAction(
                    actionId,
                  );
              }
            }

            if (
              action ===
              'start-sync'
            ) {
              void callbacks
                .onStartSync();
            }

            if (
              action ===
              'stop-sync'
            ) {
              void callbacks
                .onStopSync();
            }

            if (
              action ===
              'refresh'
            ) {
              void callbacks
                .onRefresh();
            }
          },
        );
      },
    );

  const composer =
    root.querySelector<
      HTMLFormElement
    >(
      '[data-role="composer"]',
    );

  const input =
    root.querySelector<
      HTMLTextAreaElement
    >(
      '#ds-copilot-input',
    );

  if (
    composer &&
    input
  ) {
    const submit =
      async () => {
        const message =
          input.value.trim();

        if (
          !message
        ) {
          return;
        }

        input.value =
          '';

        await callbacks
          .onSendMessage(
            message,
          );
      };

    composer.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void submit();
      },
    );

    input.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key ===
            'Enter' &&
          !event.shiftKey
        ) {
          event.preventDefault();
          void submit();
        }
      },
    );
  }
}

export function renderProductionUiForTest(
  snapshot:
    ProductionUiSnapshot,
): string {
  return renderShell(
    snapshot,
  );
}
