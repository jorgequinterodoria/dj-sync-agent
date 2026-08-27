export const RECOMMENDATION_ENGINE_VERSION = '1.0.0' as const;
export const RECOMMENDATION_SCHEMA_VERSION = 1 as const;

export type RecommendationReasonCode =
  | 'bpm_compatible'
  | 'key_compatible'
  | 'energy_compatible'
  | 'genre_match'
  | 'semantic_similarity'
  | 'rating'
  | 'engagement'
  | 'history_penalty'
  | 'artist_diversity'
  | 'constraint_penalty';

export interface TrackRecommendationCandidate {
  trackId: string;
  trackHash?: string | null;
  title?: string | null;
  artist?: string | null;
  genre?: string | null;
  key?: string | null;
  bpm?: number | null;
  energy?: number | null;
  rating?: number | null;
  playCount?: number | null;
  semanticSimilarity?: number | null;
  recentlyPlayed?: boolean;
}

export interface RecommendationConstraints {
  minBpm?: number | null;
  maxBpm?: number | null;
  maxBpmDelta?: number | null;
  allowedGenres?: string[];
  excludedGenres?: string[];
  minRating?: number | null;
  targetEnergy?: number | null;
  maxRepeatedArtists?: number;
  excludeTrackIds?: string[];
  excludeRecentlyPlayed?: boolean;
}

export interface RecommendationContext {
  deviceId: string;
  currentTrack: TrackRecommendationCandidate;
  candidates: TrackRecommendationCandidate[];
  request: string;
  constraints?: RecommendationConstraints;
  recentTrackIds?: string[];
  recentArtistNames?: string[];
  limit?: number;
}

export interface RecommendationReason {
  code: RecommendationReasonCode;
  score: number;
  detail: string;
}

export interface TrackRecommendation {
  rank: number;
  trackId: string;
  score: number;
  confidence: number;
  hardConstraintPass: boolean;
  reasons: RecommendationReason[];
  transition: {
    bpmDelta: number | null;
    energyDelta: number | null;
    keyRelation: 'same' | 'compatible' | 'different' | 'unknown';
  };
}

export interface RecommendationResult {
  schemaVersion: 1;
  engineVersion: string;
  recommendationId: string;
  generatedAt: string;
  deviceId: string;
  currentTrackId: string;
  request: string;
  appliedConstraints: RecommendationConstraints;
  recommendations: TrackRecommendation[];
  candidateCount: number;
  eligibleCount: number;
  generatedBy: 'deterministic' | 'deterministic+ai';
}

export interface SetTrackInput extends TrackRecommendationCandidate {
  role?: 'opening' | 'build' | 'peak' | 'bridge' | 'cooldown' | 'closing';
}

export interface SetIntelligenceResult {
  schemaVersion: 1;
  engineVersion: string;
  setId: string;
  generatedAt: string;
  deviceId: string;
  request: string;
  durationMinutes: number | null;
  trackCount: number;
  energyCurve: number[];
  bpmRange: { min: number | null; max: number | null };
  genreCoverage: string[];
  artistCount: number;
  repeatedArtistCount: number;
  warnings: string[];
  trackIds: string[];
}
