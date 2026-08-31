import { createSetBuilder } from '../recommendations/set-builder.js';
import type {
  SetBuildConstraints,
  SetBuildResult,
  SetBuilderCandidate,
} from '../recommendations/set-builder.js';

export interface DJSyncSetBuilderSource {
  getTrack(trackId: string): Promise<SetBuilderCandidate | null>;
}

export interface DJSyncSetBuilderService {
  build(input: {
    readonly deviceId: string;
    readonly request: string;
    readonly trackIds: readonly string[];
    readonly startTrackId?: string;
    readonly trackCount?: number;
    readonly durationMinutes?: number;
    readonly constraints?: SetBuildConstraints;
  }): Promise<SetBuildResult>;

  analyze(input: {
    readonly deviceId: string;
    readonly request: string;
    readonly trackIds: readonly string[];
  }): Promise<SetBuildResult>;
}

export function createDJSyncSetBuilderService(
  source: DJSyncSetBuilderSource,
): DJSyncSetBuilderService {
  const builder = createSetBuilder();

  async function loadCandidates(
    trackIds: readonly string[],
  ): Promise<readonly SetBuilderCandidate[]> {
    const ids = [...new Set(
      trackIds.map((value) => value.trim()).filter(Boolean),
    )];

    const loaded = await Promise.all(
      ids.map((trackId) => source.getTrack(trackId)),
    );

    return loaded.filter(
      (track): track is SetBuilderCandidate => track !== null,
    );
  }

  return {
    async build(input) {
      const candidates = await loadCandidates(input.trackIds);
      const startTrack = input.startTrackId === undefined
        ? null
        : candidates.find(
            (candidate) =>
              candidate.trackId === input.startTrackId?.trim(),
          ) ?? null;

      return builder.build({
        deviceId: input.deviceId,
        request: input.request,
        candidates,
        ...(startTrack !== null ? { startTrack } : {}),
        ...(input.trackCount !== undefined ? { trackCount: input.trackCount } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
      });
    },

    async analyze(input) {
      const candidates = await loadCandidates(input.trackIds);
      if (!candidates.length) {
        throw new Error('Set analysis requires at least one resolved track.');
      }

      return builder.build({
        deviceId: input.deviceId,
        request: input.request,
        candidates,
        trackCount: candidates.length,
        constraints: {
          maxBpmDelta: Number.POSITIVE_INFINITY,
          maxEnergyDelta: Number.POSITIVE_INFINITY,
          maxArtistRepeats: Math.max(0, candidates.length),
          maxGenreSwitches: Math.max(0, candidates.length),
          excludeRecentlyPlayed: false,
        },
      });
    },
  };
}
