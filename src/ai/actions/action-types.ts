export type DJActionType =
  | 'playlist.add'
  | 'playlist.remove'
  | 'playlist.create'
  | 'cue.create'
  | 'cue.remove';

export interface DJAction {
  readonly type: DJActionType;
  readonly trackId?: string;
  readonly playlistId?: string;
  readonly playlistName?: string;
  readonly cueId?: string;
  readonly position?: number;
  readonly label?: string;
  readonly color?: number;
}

export interface ValidatedDJAction {
  readonly action: DJAction;
  readonly actionHash: string;
  readonly affectedResources: readonly string[];
  readonly reversible: boolean;
}

function requiredId(
  value: string | undefined,
  field: string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return normalized;
}

export function validateDJAction(
  action: DJAction,
): ValidatedDJAction {
  const affectedResources: string[] = [];

  switch (action.type) {
    case 'playlist.add':
    case 'playlist.remove': {
      const playlistId =
        requiredId(
          action.playlistId,
          'playlistId',
        );

      const trackId =
        requiredId(
          action.trackId,
          'trackId',
        );

      affectedResources.push(
        `playlist:${playlistId}`,
        `track:${trackId}`,
      );

      break;
    }

    case 'playlist.create': {
      const playlistName =
        requiredId(
          action.playlistName,
          'playlistName',
        );

      affectedResources.push(
        `playlist-name:${playlistName}`,
      );

      break;
    }

    case 'cue.create': {
      const trackId =
        requiredId(
          action.trackId,
          'trackId',
        );

      affectedResources.push(
        `track:${trackId}`,
      );

      if (
        action.position ===
          undefined ||
        !Number.isFinite(
          action.position,
        ) ||
        action.position < 0
      ) {
        throw new Error(
          'position must be a non-negative finite number.',
        );
      }

      break;
    }

    case 'cue.remove': {
      const trackId =
        requiredId(
          action.trackId,
          'trackId',
        );

      const cueId =
        requiredId(
          action.cueId,
          'cueId',
        );

      affectedResources.push(
        `track:${trackId}`,
        `cue:${cueId}`,
      );

      break;
    }
  }

  const serialized =
    JSON.stringify(action);

  let hash = 2166136261;

  for (
    let index = 0;
    index < serialized.length;
    index += 1
  ) {
    hash ^=
      serialized.charCodeAt(index);

    hash = Math.imul(
      hash,
      16777619,
    );
  }

  return {
    action,
    actionHash:
      (hash >>> 0)
        .toString(16)
        .padStart(8, '0'),
    affectedResources,
    reversible:
      action.type !==
      'playlist.create',
  };
}