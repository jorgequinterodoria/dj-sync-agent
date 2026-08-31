import type { TrackRecommendationCandidate } from './recommendation-types.js';
import { keyRelation, type KeyRelation } from './key-compatibility.js';

export const SET_BUILDER_SCHEMA_VERSION = 1 as const;
export const SET_BUILDER_ENGINE_VERSION = '1.1.0' as const;

export type SetRole =
  | 'opening'
  | 'build'
  | 'peak'
  | 'bridge'
  | 'cooldown'
  | 'closing';

export interface SetBuilderCandidate
  extends TrackRecommendationCandidate {
  readonly durationSeconds?: number | null;
}

export interface SetBuildConstraints {
  readonly maxBpmDelta?: number;
  readonly maxEnergyDelta?: number;
  readonly maxArtistRepeats?: number;
  readonly maxGenreSwitches?: number;
  readonly excludeTrackIds?: readonly string[];
  readonly excludeRecentlyPlayed?: boolean;
  readonly targetStartEnergy?: number | null;
  readonly targetEndEnergy?: number | null;
}

export interface SetBuilderRequest {
  readonly deviceId: string;
  readonly request: string;
  readonly candidates: readonly SetBuilderCandidate[];
  readonly startTrack?: SetBuilderCandidate | null;
  readonly trackCount?: number;
  readonly durationMinutes?: number | null;
  readonly constraints?: SetBuildConstraints;
  readonly setId?: string;
}

export interface SetTransition {
  readonly fromTrackId: string;
  readonly toTrackId: string;
  readonly bpmDelta: number | null;
  readonly energyDelta: number | null;
  readonly keyRelation: KeyRelation;
  readonly score: number;
}

export interface BuiltSetTrack {
  readonly position: number;
  readonly track: SetBuilderCandidate;
  readonly role: SetRole;
  readonly score: number;
}

export interface SetBuildAnalysis {
  readonly requestedTrackCount: number;
  readonly satisfiedTrackCount: number;
  readonly averageTransitionScore: number | null;
  readonly averageBpmDelta: number | null;
  readonly averageEnergyDelta: number | null;
  readonly energyMin: number | null;
  readonly energyMax: number | null;
  readonly bpmMin: number | null;
  readonly bpmMax: number | null;
  readonly genreSwitches: number;
  readonly repeatedArtistCount: number;
  readonly repeatedTrackCount: number;
  readonly warnings: readonly string[];
}

export interface SetBuildResult {
  readonly schemaVersion: 1;
  readonly engineVersion: string;
  readonly setId: string;
  readonly generatedAt: string;
  readonly deviceId: string;
  readonly request: string;
  readonly durationMinutes: number | null;
  readonly tracks: readonly BuiltSetTrack[];
  readonly transitions: readonly SetTransition[];
  readonly energyCurve: readonly number[];
  readonly analysis: SetBuildAnalysis;
}

export interface SetBuilderOptions {
  readonly now?: () => string;
  readonly id?: () => string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase();
  return normalized || null;
}

function normalizeEnergy(value: number | null | undefined): number | null {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return clamp01(value > 1 ? value / 10 : value);
}

function positiveInteger(
  value: number | undefined,
  field: string,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;

  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(
      `${field} must be an integer between 1 and ${max}.`,
    );
  }

  return value;
}

function resolveTrackCount(
  request: SetBuilderRequest,
): number {
  if (request.trackCount !== undefined) {
    return positiveInteger(
      request.trackCount,
      'trackCount',
      12,
      100,
    );
  }

  if (
    request.durationMinutes === undefined ||
    request.durationMinutes === null
  ) {
    return Math.max(
      1,
      Math.min(12, request.candidates.length),
    );
  }

  if (
    !Number.isFinite(request.durationMinutes) ||
    request.durationMinutes <= 0
  ) {
    throw new Error(
      'durationMinutes must be a positive finite number.',
    );
  }

  const durations = request.candidates
    .map((candidate) => candidate.durationSeconds)
    .filter(
      (value): value is number =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value > 0,
    )
    .sort((a, b) => a - b);

  const median =
    durations[Math.floor(durations.length / 2)] ?? 240;

  return Math.max(
    1,
    Math.min(
      100,
      Math.ceil((request.durationMinutes * 60) / median),
    ),
  );
}

function transitionScore(
  from: SetBuilderCandidate,
  to: SetBuilderCandidate,
): SetTransition {
  const bpmDelta =
    typeof from.bpm === 'number' &&
    Number.isFinite(from.bpm) &&
    typeof to.bpm === 'number' &&
    Number.isFinite(to.bpm)
      ? to.bpm - from.bpm
      : null;

  const fromEnergy = normalizeEnergy(from.energy);
  const toEnergy = normalizeEnergy(to.energy);

  const energyDelta =
    fromEnergy !== null && toEnergy !== null
      ? toEnergy - fromEnergy
      : null;

  const relation = keyRelation(
    from.key,
    to.key,
  );

  const bpmScore =
    bpmDelta === null
      ? 0.5
      : 1 - Math.min(Math.abs(bpmDelta), 16) / 16;

  const energyScore =
    energyDelta === null
      ? 0.5
      : 1 - Math.min(Math.abs(energyDelta), 0.5) / 0.5;

  const keyScore =
    relation === 'same'
      ? 1
      : relation === 'compatible'
        ? 0.85
        : relation === 'different'
          ? 0.2
          : 0.5;

  const genreA = normalize(from.genre);
  const genreB = normalize(to.genre);
  const genreScore =
    genreA !== null &&
    genreB !== null &&
    genreA === genreB
      ? 1
      : 0.5;

  return {
    fromTrackId: from.trackId,
    toTrackId: to.trackId,
    bpmDelta,
    energyDelta,
    keyRelation: relation,
    score: clamp100(
      bpmScore * 35 +
        energyScore * 30 +
        keyScore * 25 +
        genreScore * 10,
    ),
  };
}

function hardEligible(
  candidate: SetBuilderCandidate,
  previous: SetBuilderCandidate | null,
  used: ReadonlySet<string>,
  artistCounts: ReadonlyMap<string, number>,
  genreSwitches: number,
  constraints: SetBuildConstraints,
): boolean {
  if (used.has(candidate.trackId)) return false;

  if (
    (constraints.excludeTrackIds ?? []).includes(
      candidate.trackId,
    )
  ) {
    return false;
  }

  if (
    constraints.excludeRecentlyPlayed &&
    candidate.recentlyPlayed === true
  ) {
    return false;
  }

  const artist = normalize(candidate.artist);
  if (
    artist !== null &&
    (artistCounts.get(artist) ?? 0) >=
      (constraints.maxArtistRepeats ?? 0) + 1
  ) {
    return false;
  }

  if (!previous) return true;

  const transition = transitionScore(
    previous,
    candidate,
  );

  if (
    constraints.maxBpmDelta !== undefined &&
    transition.bpmDelta !== null &&
    Math.abs(transition.bpmDelta) >
      constraints.maxBpmDelta
  ) {
    return false;
  }

  if (
    constraints.maxEnergyDelta !== undefined &&
    transition.energyDelta !== null &&
    Math.abs(transition.energyDelta) >
      constraints.maxEnergyDelta
  ) {
    return false;
  }

  const fromGenre = normalize(previous.genre);
  const toGenre = normalize(candidate.genre);

  if (
    constraints.maxGenreSwitches !== undefined &&
    fromGenre !== null &&
    toGenre !== null &&
    fromGenre !== toGenre &&
    genreSwitches >=
      constraints.maxGenreSwitches
  ) {
    return false;
  }

  return true;
}

function roleFor(
  index: number,
  total: number,
  energy: number | null,
  previousEnergy: number | null,
): SetRole {
  if (index === 0) return 'opening';
  if (index === total - 1) return 'closing';

  const ratio =
    index / Math.max(1, total - 1);
  const direction =
    energy !== null && previousEnergy !== null
      ? energy - previousEnergy
      : 0;

  if (ratio < 0.25) return 'opening';
  if (ratio < 0.55) return direction < -0.08 ? 'bridge' : 'build';
  if (ratio < 0.8) return 'peak';
  if (direction < -0.08) return 'cooldown';
  return 'closing';
}

function analyzeSet(
  tracks: readonly BuiltSetTrack[],
  transitions: readonly SetTransition[],
  warnings: readonly string[],
  requestedTrackCount: number,
): SetBuildAnalysis {
  const bpm = tracks
    .map((item) => item.track.bpm)
    .filter(
      (value): value is number =>
        typeof value === 'number' &&
        Number.isFinite(value),
    );

  const energy = tracks
    .map((item) => normalizeEnergy(item.track.energy))
    .filter(
      (value): value is number =>
        value !== null,
    );

  const artists = tracks
    .map((item) => normalize(item.track.artist))
    .filter(
      (value): value is string =>
        value !== null,
    );

  const ids = tracks.map(
    (item) => item.track.trackId,
  );

  let genreSwitches = 0;
  for (let index = 1; index < tracks.length; index += 1) {
    const previous = tracks[index - 1];
    const current = tracks[index];
    if (!previous || !current) continue;

    const previousGenre = normalize(
      previous.track.genre,
    );
    const currentGenre = normalize(
      current.track.genre,
    );

    if (
      previousGenre !== null &&
      currentGenre !== null &&
      previousGenre !== currentGenre
    ) {
      genreSwitches += 1;
    }
  }

  const uniqueArtists = new Set(artists);
  const uniqueIds = new Set(ids);

  const repeatedArtistCount =
    artists.length - uniqueArtists.size;
  const repeatedTrackCount =
    ids.length - uniqueIds.size;

  const safeWarnings = [...warnings];

  if (repeatedArtistCount > 0) {
    safeWarnings.push(
      'The set contains repeated artists.',
    );
  }

  if (repeatedTrackCount > 0) {
    safeWarnings.push(
      'The set contains repeated track ids.',
    );
  }

  if (
    bpm.length >= 2 &&
    Math.max(...bpm) - Math.min(...bpm) > 20
  ) {
    safeWarnings.push(
      'The set spans a wide BPM range.',
    );
  }

  if (
    transitions.some(
      (item) => item.keyRelation === 'different',
    )
  ) {
    safeWarnings.push(
      'One or more transitions use different harmonic keys.',
    );
  }

  const bpmDeltas = transitions
    .map((item) => item.bpmDelta)
    .filter(
      (value): value is number => value !== null,
    );

  const energyDeltas = transitions
    .map((item) => item.energyDelta)
    .filter(
      (value): value is number => value !== null,
    );

  return {
    requestedTrackCount,
    satisfiedTrackCount: tracks.length,
    averageTransitionScore:
      transitions.length
        ? transitions.reduce(
            (sum, item) => sum + item.score,
            0,
          ) / transitions.length
        : null,
    averageBpmDelta:
      bpmDeltas.length
        ? bpmDeltas.reduce(
            (sum, value) => sum + value,
            0,
          ) / bpmDeltas.length
        : null,
    averageEnergyDelta:
      energyDeltas.length
        ? energyDeltas.reduce(
            (sum, value) => sum + value,
            0,
          ) / energyDeltas.length
        : null,
    energyMin:
      energy.length ? Math.min(...energy) : null,
    energyMax:
      energy.length ? Math.max(...energy) : null,
    bpmMin:
      bpm.length ? Math.min(...bpm) : null,
    bpmMax:
      bpm.length ? Math.max(...bpm) : null,
    genreSwitches,
    repeatedArtistCount,
    repeatedTrackCount,
    warnings: [...new Set(safeWarnings)],
  };
}

export class SetBuilder {
  private readonly now: () => string;
  private readonly id: () => string;

  public constructor(options: SetBuilderOptions = {}) {
    this.now =
      options.now ??
      (() => new Date().toISOString());
    this.id =
      options.id ??
      (() => crypto.randomUUID());
  }

  public build(
    request: SetBuilderRequest,
  ): SetBuildResult {
    const deviceId = request.deviceId.trim();
    const userRequest = request.request.trim();

    if (!deviceId) {
      throw new Error(
        'Set builder device id is required.',
      );
    }

    if (!userRequest) {
      throw new Error(
        'Set builder request is required.',
      );
    }

    if (!request.candidates.length && !request.startTrack) {
      throw new Error(
        'Set builder requires candidates or a start track.',
      );
    }

    const constraints: SetBuildConstraints = {
      maxBpmDelta: 8,
      maxEnergyDelta: 0.2,
      maxArtistRepeats: 0,
      maxGenreSwitches: 8,
      excludeRecentlyPlayed: true,
      ...request.constraints,
    };

    const desiredCount = resolveTrackCount(request);
    const excluded = new Set(
      constraints.excludeTrackIds ?? [],
    );

    const candidates = request.candidates
      .map((candidate) => ({
        ...candidate,
        trackId: candidate.trackId.trim(),
      }))
      .filter(
        (candidate) =>
          Boolean(candidate.trackId) &&
          !excluded.has(candidate.trackId),
      );

    const tracks: BuiltSetTrack[] = [];
    const transitions: SetTransition[] = [];
    const used = new Set<string>();
    const artistCounts = new Map<string, number>();
    const warnings: string[] = [];

    let genreSwitches = 0;

    if (request.startTrack) {
      const start = {
        ...request.startTrack,
        trackId:
          request.startTrack.trackId.trim(),
      };

      if (!start.trackId) {
        throw new Error(
          'Set builder start track id is required.',
        );
      }

      tracks.push({
        position: 1,
        track: start,
        role: 'opening',
        score: 100,
      });

      used.add(start.trackId);

      const artist = normalize(start.artist);
      if (artist) {
        artistCounts.set(artist, 1);
      }
    }

    while (tracks.length < desiredCount) {
      const previous =
        tracks.at(-1)?.track ?? null;

      const remaining = candidates
        .filter(
          (candidate) =>
            !used.has(candidate.trackId),
        )
        .filter((candidate) =>
          hardEligible(
            candidate,
            previous,
            used,
            artistCounts,
            genreSwitches,
            constraints,
          ),
        );

      if (!remaining.length) {
        break;
      }

      const ratio =
        tracks.length /
        Math.max(1, desiredCount - 1);

      const startEnergy =
        normalizeEnergy(
          constraints.targetStartEnergy,
        );
      const endEnergy =
        normalizeEnergy(
          constraints.targetEndEnergy,
        );

      const targetEnergy =
        startEnergy !== null &&
        endEnergy !== null
          ? startEnergy +
            (endEnergy - startEnergy) * ratio
          : null;

      const ranked = remaining
        .map((candidate) => {
          const transition = previous
            ? transitionScore(
                previous,
                candidate,
              )
            : null;

          let score =
            transition?.score ?? 50;

          if (
            targetEnergy !== null
          ) {
            const candidateEnergy =
              normalizeEnergy(
                candidate.energy,
              );
            if (candidateEnergy !== null) {
              score +=
                (1 -
                  Math.min(
                    Math.abs(
                      candidateEnergy -
                        targetEnergy,
                    ),
                    1,
                  )) *
                15;
            }
          }

          const rating =
            candidate.rating === null ||
            candidate.rating === undefined
              ? 0.5
              : clamp01(
                  candidate.rating / 5,
                );

          score += rating * 8;

          return {
            candidate,
            transition,
            score: clamp100(score),
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.candidate.trackId.localeCompare(
              b.candidate.trackId,
            ),
        );

      const selected = ranked[0];
      if (!selected) break;

      if (
        selected.transition &&
        previous
      ) {
        transitions.push(
          selected.transition,
        );

        const previousGenre = normalize(
          previous.genre,
        );
        const selectedGenre = normalize(
          selected.candidate.genre,
        );

        if (
          previousGenre !== null &&
          selectedGenre !== null &&
          previousGenre !== selectedGenre
        ) {
          genreSwitches += 1;
        }
      }

      const position = tracks.length + 1;
      const energy = normalizeEnergy(
        selected.candidate.energy,
      );
      const previousEnergy = previous
        ? normalizeEnergy(previous.energy)
        : null;

      tracks.push({
        position,
        track: selected.candidate,
        role: roleFor(
          position - 1,
          desiredCount,
          energy,
          previousEnergy,
        ),
        score: selected.score,
      });

      used.add(
        selected.candidate.trackId,
      );

      const artist = normalize(
        selected.candidate.artist,
      );

      if (artist) {
        artistCounts.set(
          artist,
          (artistCounts.get(artist) ?? 0) + 1,
        );
      }
    }

    if (tracks.length === 0) {
      throw new Error(
        'Set builder could not select any eligible track.',
      );
    }

    if (tracks.length < desiredCount) {
      warnings.push(
        'The requested set length could not be fully satisfied with the available candidates and hard constraints.',
      );
    }

    const energyCurve = tracks
      .map((item) => normalizeEnergy(item.track.energy))
      .filter(
        (value): value is number =>
          value !== null,
      );

    return {
      schemaVersion: 1,
      engineVersion:
        SET_BUILDER_ENGINE_VERSION,
      setId:
        request.setId?.trim() || this.id(),
      generatedAt: this.now(),
      deviceId,
      request: userRequest,
      durationMinutes:
        request.durationMinutes ?? null,
      tracks,
      transitions,
      energyCurve,
      analysis: analyzeSet(
        tracks,
        transitions,
        warnings,
        desiredCount,
      ),
    };
  }
}

export function createSetBuilder(
  options: SetBuilderOptions = {},
): SetBuilder {
  return new SetBuilder(options);
}
