import type {
  DJCue,
} from '../domain/dj-cue.js';

export interface CueActionRepository {
  createCue(
    input: Omit<
      DJCue,
      'id'
    > & {
      readonly id?: string;
    },
  ): Promise<DJCue>;

  removeCue(
    trackId: string,
    cueId: string,
  ): Promise<void>;
}

export interface CueActions {
  createCue(
    input: Omit<
      DJCue,
      'id'
    > & {
      readonly id?: string;
    },
  ): Promise<DJCue>;

  removeCue(
    trackId: string,
    cueId: string,
  ): Promise<void>;
}

export function createCueActions(
  repository: CueActionRepository,
): CueActions {
  return {
    createCue: (input) =>
      repository.createCue({
        ...input,
        trackId:
          input.trackId.trim(),
      }),

    removeCue: (
      trackId,
      cueId,
    ) =>
      repository.removeCue(
        trackId.trim(),
        cueId.trim(),
      ),
  };
}
