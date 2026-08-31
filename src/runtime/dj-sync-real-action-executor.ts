import type {
  ValidatedDJAction,
} from '../ai/actions/action-types.js';

import type {
  PlaylistActions,
} from '../core/actions/playlist-actions.js';

import type {
  CueActions,
} from '../core/actions/cue-actions.js';

export type ActionExecutionStatus =
  | 'executed'
  | 'failed';

export interface ActionExecutionResult {
  readonly status: ActionExecutionStatus;
  readonly actionHash: string;
  readonly result?: unknown;
  readonly error?: string;
}

export interface DJSyncRealActionExecutor {
  execute(
    action: ValidatedDJAction,
  ): Promise<ActionExecutionResult>;
}

export interface DJSyncRealActionExecutorOptions {
  readonly playlists: PlaylistActions;
  readonly cues: CueActions;
}

export function createDJSyncRealActionExecutor(
  options: DJSyncRealActionExecutorOptions,
): DJSyncRealActionExecutor {
  return {
    async execute(action) {
      try {
        switch (action.action.type) {
          case 'playlist.add': {
            const playlistId =
              action.action.playlistId;

            const trackId =
              action.action.trackId;

            if (!playlistId) {
              throw new Error(
                'playlistId is required.',
              );
            }

            if (!trackId) {
              throw new Error(
                'trackId is required.',
              );
            }

            await options.playlists.addTrack(
              playlistId,
              trackId,
            );

            return {
              status: 'executed',
              actionHash:
                action.actionHash,
            };
          }

          case 'playlist.remove': {
            const playlistId =
              action.action.playlistId;

            const trackId =
              action.action.trackId;

            if (!playlistId) {
              throw new Error(
                'playlistId is required.',
              );
            }

            if (!trackId) {
              throw new Error(
                'trackId is required.',
              );
            }

            await options.playlists.removeTrack(
              playlistId,
              trackId,
            );

            return {
              status: 'executed',
              actionHash:
                action.actionHash,
            };
          }

          case 'playlist.create': {
            const playlistName =
              action.action.playlistName;

            if (!playlistName) {
              throw new Error(
                'playlistName is required.',
              );
            }

            return {
              status: 'executed',
              actionHash:
                action.actionHash,
              result:
                await options.playlists.createPlaylist(
                  playlistName,
                ),
            };
          }

          case 'cue.create': {
            const trackId =
              action.action.trackId;

            const position =
              action.action.position;

            if (!trackId) {
              throw new Error(
                'trackId is required.',
              );
            }

            if (
              position ===
                undefined ||
              !Number.isFinite(
                position,
              ) ||
              position < 0
            ) {
              throw new Error(
                'position must be a non-negative finite number.',
              );
            }

            return {
              status: 'executed',
              actionHash:
                action.actionHash,

              result:
                await options.cues.createCue({
                  trackId,
                  positionSeconds:
                    position,
                  type: 'memory',
                  name:
                    action.action
                      .label ??
                    null,
                  comment: null,
                  color:
                    action.action
                      .color !==
                    undefined
                      ? String(
                          action.action
                            .color,
                        )
                      : null,
                  order: 0,
                }),
            };
          }

          case 'cue.remove': {
            const trackId =
              action.action.trackId;

            const cueId =
              action.action.cueId;

            if (!trackId) {
              throw new Error(
                'trackId is required.',
              );
            }

            if (!cueId) {
              throw new Error(
                'cueId is required.',
              );
            }

            await options.cues.removeCue(
              trackId,
              cueId,
            );

            return {
              status: 'executed',
              actionHash:
                action.actionHash,
            };
          }
        }
      } catch (error: unknown) {
        return {
          status: 'failed',
          actionHash:
            action.actionHash,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        };
      }
    },
  };
}