import { randomUUID } from 'node:crypto';

import {
  keyRelation,
} from './key-compatibility.js';
import {
  RECOMMENDATION_ENGINE_VERSION,
  type RecommendationContext,
  type RecommendationConstraints,
  type RecommendationReason,
  type RecommendationResult,
  type TrackRecommendation,
  type TrackRecommendationCandidate,
  type SetIntelligenceResult,
  type SetTrackInput,
} from './recommendation-types.js';

export interface RecommendationEngine {
  recommend(context: RecommendationContext): RecommendationResult;
  analyzeSet(input: {
    deviceId: string;
    request: string;
    tracks: SetTrackInput[];
    durationMinutes?: number | null;
    setId?: string;
  }): SetIntelligenceResult;
}

export interface RecommendationEngineOptions {
  now?: () => string;
  id?: () => string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalized(value: string | null | undefined): string | null {
  const v = value?.trim().toLocaleLowerCase();
  return v ? v : null;
}

function bpmScore(current: number | null | undefined, candidate: number | null | undefined): number {
  if (current == null || candidate == null || !Number.isFinite(current) || !Number.isFinite(candidate)) return 0.5;
  const delta = Math.abs(candidate - current);
  return clamp01(1 - Math.min(delta, 20) / 20);
}

function energyScore(current: number | null | undefined, candidate: number | null | undefined): number {
  if (current == null || candidate == null) return 0.5;
  return clamp01(1 - Math.min(Math.abs(candidate - current), 1));
}

function genreScore(current: string | null | undefined, candidate: string | null | undefined): number {
  const a = normalized(current);
  const b = normalized(candidate);
  if (!a || !b) return 0.5;
  return a === b ? 1 : 0;
}

function ratingScore(rating: number | null | undefined): number {
  if (rating == null) return 0.5;
  return clamp01(rating / 5);
}

function engagementScore(playCount: number | null | undefined): number {
  if (playCount == null || playCount < 0) return 0.5;
  return clamp01(Math.log10(playCount + 1) / 4);
}

function hardConstraintPass(
  current: TrackRecommendationCandidate,
  candidate: TrackRecommendationCandidate,
  constraints: RecommendationConstraints,
): boolean {
  if ((constraints.excludeTrackIds ?? []).includes(candidate.trackId)) return false;
  if (constraints.excludeRecentlyPlayed && candidate.recentlyPlayed) return false;
  if (constraints.minBpm != null && (candidate.bpm == null || candidate.bpm < constraints.minBpm)) return false;
  if (constraints.maxBpm != null && (candidate.bpm == null || candidate.bpm > constraints.maxBpm)) return false;
  if (constraints.maxBpmDelta != null && current.bpm != null && candidate.bpm != null) {
    if (Math.abs(candidate.bpm - current.bpm) > constraints.maxBpmDelta) return false;
  }
  if (constraints.minRating != null && (candidate.rating == null || candidate.rating < constraints.minRating)) return false;
  const candidateGenre = normalized(candidate.genre);
  const allowed = (constraints.allowedGenres ?? []).map((v) => v.trim().toLocaleLowerCase()).filter(Boolean);
  const excluded = (constraints.excludedGenres ?? []).map((v) => v.trim().toLocaleLowerCase()).filter(Boolean);
  if (allowed.length && (!candidateGenre || !allowed.includes(candidateGenre))) return false;
  if (excluded.length && candidateGenre && excluded.includes(candidateGenre)) return false;
  return true;
}

function reason(code: RecommendationReason['code'], score: number, detail: string): RecommendationReason {
  return { code, score: clamp100(score), detail };
}

function scoreCandidate(
  current: TrackRecommendationCandidate,
  candidate: TrackRecommendationCandidate,
  constraints: RecommendationConstraints,
  recentArtistNames: string[],
): TrackRecommendation {
  const bpm = bpmScore(current.bpm, candidate.bpm);
  const energy = energyScore(current.energy, candidate.energy);
  const key = keyRelation(current.key, candidate.key);
  const keyScore = key === 'same' ? 1 : key === 'compatible' ? 0.85 : key === 'different' ? 0.25 : 0.5;
  const genre = genreScore(current.genre, candidate.genre);
  const semantic = candidate.semanticSimilarity == null ? 0.5 : clamp01(candidate.semanticSimilarity);
  const rating = ratingScore(candidate.rating);
  const engagement = engagementScore(candidate.playCount);
  const recentArtist = normalized(candidate.artist) && recentArtistNames.map(normalized).includes(normalized(candidate.artist));

  const base =
    bpm * 25 +
    keyScore * 20 +
    energy * 15 +
    genre * 10 +
    semantic * 15 +
    rating * 8 +
    engagement * 7;

  const historyPenalty = recentArtist ? 15 : 0;
  const score = clamp100(base - historyPenalty);
  const pass = hardConstraintPass(current, candidate, constraints);

  const reasons: RecommendationReason[] = [
    reason('bpm_compatible', bpm * 100, `BPM compatibility score ${(bpm * 100).toFixed(0)}.`),
    reason('key_compatible', keyScore * 100, `Key relation: ${key}.`),
    reason('energy_compatible', energy * 100, `Energy continuity score ${(energy * 100).toFixed(0)}.`),
    reason('genre_match', genre * 100, genre === 1 ? 'Genre matches the current track.' : 'Genre differs from the current track.'),
    reason('semantic_similarity', semantic * 100, `Semantic similarity score ${(semantic * 100).toFixed(0)}.`),
    reason('rating', rating * 100, `Rating contribution ${(rating * 100).toFixed(0)}.`),
    reason('engagement', engagement * 100, `Engagement contribution ${(engagement * 100).toFixed(0)}.`),
  ];
  if (recentArtist) reasons.push(reason('history_penalty', 15, 'Artist appeared in recent history.'));

  const bpmDelta = current.bpm != null && candidate.bpm != null ? candidate.bpm - current.bpm : null;
  const energyDelta = current.energy != null && candidate.energy != null ? candidate.energy - current.energy : null;

  return {
    rank: 0,
    trackId: candidate.trackId,
    score: pass ? score : 0,
    confidence: clamp01((pass ? score : 0) / 100),
    hardConstraintPass: pass,
    reasons,
    transition: {
      bpmDelta,
      energyDelta,
      keyRelation: key,
    },
  };
}

function deriveDefaultConstraints(context: RecommendationContext): RecommendationConstraints {
  return {
    maxBpmDelta: context.constraints?.maxBpmDelta ?? 8,
    excludeRecentlyPlayed: context.constraints?.excludeRecentlyPlayed ?? true,
    maxRepeatedArtists: context.constraints?.maxRepeatedArtists ?? 0,
    excludeTrackIds: [context.currentTrack.trackId, ...(context.constraints?.excludeTrackIds ?? [])],
    ...context.constraints,
  };
}

export function createRecommendationEngine(options: RecommendationEngineOptions = {}): RecommendationEngine {
  const now = options.now ?? (() => new Date().toISOString());
  const id = options.id ?? randomUUID;

  return {
    recommend(context) {
      const deviceId = context.deviceId.trim();
      const request = context.request.trim();
      if (!deviceId) throw new Error('Recommendation device id is required.');
      if (!context.currentTrack.trackId.trim()) throw new Error('Recommendation current track id is required.');
      if (!request) throw new Error('Recommendation request is required.');

      const constraints = deriveDefaultConstraints(context);
      const recentArtistNames = context.recentArtistNames ?? [];
      const scored = context.candidates
        .filter((candidate) => candidate.trackId.trim() !== context.currentTrack.trackId.trim())
        .filter((candidate) => {
          if (!constraints.excludeRecentlyPlayed) return true;
          const artist = normalized(candidate.artist);
          if (!artist) return true;
          const recentArtists = recentArtistNames
            .map(normalized)
            .filter((value): value is string => value !== null);
          return !recentArtists.includes(artist);
        })
        .map((candidate) => scoreCandidate(context.currentTrack, candidate, constraints, recentArtistNames))
        .filter((item) => item.hardConstraintPass)
        .sort((a, b) => b.score - a.score || a.trackId.localeCompare(b.trackId));

      const limit = Math.max(1, Math.min(50, Math.trunc(context.limit ?? 10)));
      const recommendations = scored.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));

      return {
        schemaVersion: 1,
        engineVersion: RECOMMENDATION_ENGINE_VERSION,
        recommendationId: id(),
        generatedAt: now(),
        deviceId,
        currentTrackId: context.currentTrack.trackId.trim(),
        request,
        appliedConstraints: constraints,
        recommendations,
        candidateCount: context.candidates.length,
        eligibleCount: scored.length,
        generatedBy: 'deterministic',
      };
    },

    analyzeSet(input) {
      const deviceId = input.deviceId.trim();
      const request = input.request.trim();
      if (!deviceId) throw new Error('Set intelligence device id is required.');
      if (!request) throw new Error('Set intelligence request is required.');

      const bpmValues = input.tracks.map((t) => t.bpm).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const energies = input.tracks.map((t) => t.energy).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const genres = [...new Set(input.tracks.map((t) => normalized(t.genre)).filter((v): v is string => Boolean(v)))];
      const artists = input.tracks.map((t) => normalized(t.artist)).filter((v): v is string => Boolean(v));
      const uniqueArtists = new Set(artists);
      const repeatedArtists = artists.length - uniqueArtists.size;

      const warnings: string[] = [];
      if (bpmValues.length >= 2 && Math.max(...bpmValues) - Math.min(...bpmValues) > 20) warnings.push('Wide BPM range may require multiple transition strategies.');
      if (repeatedArtists > 0) warnings.push('The set repeats one or more artists.');
      if (!input.tracks.length) warnings.push('No tracks were provided.');
      if (input.durationMinutes != null && input.durationMinutes > 0 && input.tracks.length > input.durationMinutes) warnings.push('Average track duration may be short for the requested set length.');

      return {
        schemaVersion: 1,
        engineVersion: RECOMMENDATION_ENGINE_VERSION,
        setId: input.setId?.trim() || id(),
        generatedAt: now(),
        deviceId,
        request,
        durationMinutes: input.durationMinutes ?? null,
        trackCount: input.tracks.length,
        energyCurve: energies,
        bpmRange: {
          min: bpmValues.length ? Math.min(...bpmValues) : null,
          max: bpmValues.length ? Math.max(...bpmValues) : null,
        },
        genreCoverage: genres,
        artistCount: uniqueArtists.size,
        repeatedArtistCount: repeatedArtists,
        warnings,
        trackIds: input.tracks.map((t) => t.trackId),
      };
    },
  };
}
