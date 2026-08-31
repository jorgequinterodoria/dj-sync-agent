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

  if (!action) {
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
      <header
        class="ds-topbar"
        data-ds-region="topbar"
      >
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
          data-ds-region="heading"
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
          <div
            class="ds-primary-column"
            data-ds-region="primary"
          >
            ${renderTrack(
              snapshot,
            )}

            <section
              class="ds-card ds-copilot-card"
              data-ds-region="copilot"
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

          <aside
            class="ds-secondary-column"
            data-ds-region="secondary"
          >
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

  const stylesheet =
    document.createElement(
      'link',
    );

  stylesheet.id =
    STYLE_ID;

  stylesheet.rel =
    'stylesheet';

  stylesheet.href =
    new URL(
      './production-ui.css',
      import.meta.url,
    ).href;

  document.head.appendChild(
    stylesheet,
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

      /*
       * The production UI receives live application updates (sync/runtime
       * state, Copilot state, activity, etc.). Those updates intentionally
       * trigger a full shell render, but the Copilot composer is a transient
       * user-editing surface and must not lose its draft on every update.
       *
       * Capture the existing textarea state before replacing the DOM, then
       * restore it after wiring events. This keeps text, focus, caret position
       * and scroll position stable while the rest of the workspace refreshes.
       */
      const previousComposer =
        options.root.querySelector<
          HTMLTextAreaElement
        >(
          '#ds-copilot-input',
        );

      const previousMessages =
        options.root.querySelector<
          HTMLElement
        >(
          '.ds-message-list',
        );

      const composerDraft =
        previousComposer?.value ??
        '';

      const composerWasFocused =
        previousComposer !==
          null &&
        document.activeElement ===
          previousComposer;

      const selectionStart =
        previousComposer?.selectionStart ??
        composerDraft.length;

      const selectionEnd =
        previousComposer?.selectionEnd ??
        composerDraft.length;

      const composerScrollTop =
        previousComposer?.scrollTop ??
        0;

      let messagesScrollTop =
        previousMessages?.scrollTop ??
        0;

      const messagesNearBottom =
        previousMessages ===
          null
          ? true
          : previousMessages
              .scrollTop +
              previousMessages
                .clientHeight >=
              previousMessages
                .scrollHeight -
                48;

      options.root.innerHTML =
        renderShell(
          current,
        );

      wireEvents(
        options.root,
        options.callbacks,
      );

      const nextMessages =
        options.root.querySelector<
          HTMLElement
        >(
          '.ds-message-list',
        );

      if (
        nextMessages !==
        null
      ) {
        if (messagesNearBottom) {
          nextMessages.scrollTop =
            nextMessages.scrollHeight;
        } else {
          const maxTop =
            Math.max(
              0,
              nextMessages
                .scrollHeight -
                nextMessages
                  .clientHeight,
            );

          nextMessages.scrollTop =
            Math.min(
              messagesScrollTop,
              maxTop,
            );
        }
      }

      const composer =
        options.root.querySelector<
          HTMLTextAreaElement
        >(
          '#ds-copilot-input',
        );

      if (
        composer !==
        null
      ) {
        composer.value =
          composerDraft;

        composer.scrollTop =
          composerScrollTop;

        if (
          composerWasFocused
        ) {
          composer.focus({
            preventScroll:
              true,
          });

          const length =
            composer.value.length;

          const safeStart =
            Math.min(
              selectionStart,
              length,
            );

          const safeEnd =
            Math.min(
              selectionEnd,
              length,
            );

          try {
            composer.setSelectionRange(
              safeStart,
              safeEnd,
            );
          } catch {
            // Some non-browser test DOM implementations do not support
            // selection ranges. The value/focus restoration still applies.
          }
        }
      }
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
