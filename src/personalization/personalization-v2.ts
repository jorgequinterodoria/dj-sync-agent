import type { PersonalizedTrackProfile } from './personalization-types.js';
import type { TrackRecommendationCandidate } from '../recommendations/recommendation-types.js';

export const PERSONALIZATION_ENGINE_V2_VERSION = '2.0.0' as const;

export interface PersonalizedRankingSignal {
  score: number;
  confidence: number;
  detail: string;
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.normalize('NFC').trim().toLocaleLowerCase();
  return normalized || null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function match(value: string | null | undefined, values: readonly string[]): number {
  const normalized = normalize(value);
  if (!normalized || values.length === 0) return 0.5;
  return values.includes(normalized) ? 1 : 0;
}

function rangeScore(value: number | null | undefined, min: number | null, max: number | null): number {
  if (value == null || (min == null && max == null)) return 0.5;
  if (min != null && value < min) return clamp01(1 - (min - value) / Math.max(1, min));
  if (max != null && value > max) return clamp01(1 - (value - max) / Math.max(1, max));
  return 1;
}

/** Deterministic personalization overlay; hard recommendation constraints remain authoritative. */
export function scorePersonalizedCandidate(
  profile: PersonalizedTrackProfile | null | undefined,
  candidate: TrackRecommendationCandidate,
): PersonalizedRankingSignal {
  if (!profile) return { score: 0.5, confidence: 0, detail: 'No personalized profile is available.' };

  const genre = match(candidate.genre, profile.profile.preferredGenres);
  const avoidedGenre = match(candidate.genre, profile.profile.avoidedGenres);
  const artist = match(candidate.artist, profile.profile.preferredArtists);
  const avoidedArtist = match(candidate.artist, profile.profile.avoidedArtists);
  const bpm = rangeScore(candidate.bpm, profile.profile.preferredBpmMin, profile.profile.preferredBpmMax);
  const energy = rangeScore(candidate.energy, profile.profile.preferredEnergyMin, profile.profile.preferredEnergyMax);
  const key = match(candidate.key, profile.profile.preferredKeys);

  const weightedConfidence = (
    profile.confidence.genre + profile.confidence.artist + profile.confidence.bpm + profile.confidence.energy + profile.confidence.key
  ) / 500;
  const positive = genre * 0.25 + artist * 0.25 + bpm * 0.18 + energy * 0.18 + key * 0.14;
  const negative = avoidedGenre * 0.5 + avoidedArtist * 0.5;
  const score = clamp01(positive - negative * 0.35);

  return {
    score,
    confidence: clamp01(weightedConfidence),
    detail: `Personalization ${(score * 100).toFixed(0)}% from genre, artist, BPM, energy and key preferences.`,
  };
}
