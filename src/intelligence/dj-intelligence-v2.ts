import type { DJTransitionRow } from '../core/local-store/types.js';
import type {
  AudioFeaturesV1,
  LocalDJHistoryStorePort,
  LocalDJPreferenceStorePort,
} from '../core/local-store/ports.js';
import type {
  RecommendationConstraints,
  TrackRecommendationCandidate,
  RecommendationReasonCode,
  RecommendationReason,
  RecommendationContext,
  TrackRecommendation,
} from '../recommendations/recommendation-types.js';
import type { DJPreferenceDimension } from '../core/local-store/types.js';

export type ContextTag = 'warmup' | 'peak' | 'afterhours' | 'opening' | 'closing' | 'unknown';

export interface PersonalTransitionScore {
  trackAId: string;
  trackBId: string;
  personalScore: number | null;
  historyFrequency: number | null;
  successScore: number | null;
  fallback: boolean;
}

export interface PreferenceSignals {
  boosts: Array<{ dimension: DJPreferenceDimension; value: string; totalWeight: number }>;
  avoids: Array<{ dimension: DJPreferenceDimension; value: string; totalWeight: number }>;
  exclusions: Array<{ dimension: DJPreferenceDimension; value: string }>;
  contextRules: Partial<Record<ContextTag, {
    minBpm?: number | null;
    maxBpm?: number | null;
    minEnergy?: number | null;
    maxEnergy?: number | null;
    boostGenres?: string[];
    avoidGenres?: string[];
  }>>;
}

export function buildPersonalTransitionScore(
  transitions: Pick<DJTransitionRow, 'track_a_id' | 'track_b_id' | 'frequency' | 'success_score'>[],
  trackAId: string,
  trackBId: string,
): PersonalTransitionScore {
  const match = transitions.find(
    (t) => t.track_a_id === trackAId && t.track_b_id === trackBId,
  );
  if (!match) {
    return {
      trackAId,
      trackBId,
      personalScore: null,
      historyFrequency: null,
      successScore: null,
      fallback: true,
    };
  }
  // personal_score = weighted freq + success; clamp 0..1.
  const freqWeight = Math.max(0, Math.min(1, match.frequency / 10)); // 10+ plays → weight=1
  const successWeight = match.success_score;
  const personalScore = Math.round((freqWeight * 0.3 + successWeight * 0.7) * 10000) / 10000;
  return {
    trackAId,
    trackBId,
    personalScore,
    historyFrequency: match.frequency,
    successScore: match.success_score,
    fallback: false,
  };
}

export function contextOfTag(raw: string | null | undefined): ContextTag {
  if (!raw) return 'unknown';
  const low = raw.trim().toLowerCase();
  if (low === 'warmup' || low === 'warm' || low === 'opening') return low === 'opening' ? 'opening' : 'warmup';
  if (low === 'peak' || low === 'main' || low === 'prime') return 'peak';
  if (low === 'afterhours' || low === 'closing' || low === 'after') return low === 'closing' ? 'closing' : 'afterhours';
  return 'unknown';
}

export async function buildPreferenceSignals(
  preferenceStore: LocalDJPreferenceStorePort,
  deviceId: string,
  contextTag: ContextTag,
): Promise<PreferenceSignals> {
  const signals: PreferenceSignals = {
    boosts: [],
    avoids: [],
    exclusions: [],
    contextRules: {},
  };
  const dimensions: DJPreferenceDimension[] = ['genre', 'artist', 'label', 'key', 'bpm_range', 'energy_range', 'track_exclusion', 'context_affinity'];
  for (const dim of dimensions) {
    if (dim === 'track_exclusion') continue; // track-level exclusions handled per candidate via isExcluded in hard constraints
    const values = await preferenceStore.listValues({ deviceId, dimension: dim });
    for (const entry of values) {
      if (entry.kind === 'preferred' || entry.kind === 'derived') {
        if (entry.totalWeight > 0) signals.boosts.push({ dimension: dim, value: entry.value, totalWeight: entry.totalWeight });
        if (entry.totalWeight < 0) signals.avoids.push({ dimension: dim, value: entry.value, totalWeight: entry.totalWeight });
      } else if (entry.kind === 'avoided') {
        signals.avoids.push({ dimension: dim, value: entry.value, totalWeight: entry.totalWeight });
      } else if (entry.kind === 'excluded') {
        signals.exclusions.push({ dimension: dim, value: entry.value });
      }
    }
  }  // Context rules hardcoded for supported tags; override later via explicit context_affinity
  signals.contextRules[contextTag] = buildDefaultContextRule(contextTag);
  // Merge context_affinity rows if any
  const affinities = await preferenceStore.listValues({ deviceId, dimension: 'context_affinity' });
  for (const row of affinities) {
    const tag = contextOfTag(row.value.split(':')[0] ?? row.value);
    if (tag === 'unknown') continue;
    const rule = signals.contextRules[tag] ?? {};
    if (row.totalWeight >= 3) {
      // Strong context affinity: boost genres encoded in value suffix genre=techno
      const genreMatch = row.value.match(/genre=([a-zA-Z0-9_-]+)/);
      if (genreMatch?.[1]) {
        rule.boostGenres = Array.from(new Set([...(rule.boostGenres ?? []), genreMatch[1]!]));
      }
    }
    signals.contextRules[tag] = rule;
  }
  return signals;
}

function buildDefaultContextRule(tag: ContextTag): NonNullable<PreferenceSignals['contextRules']['warmup']> {
  switch (tag) {
    case 'warmup':
    case 'opening':
      return { minBpm: tag === 'opening' ? 95 : 100, maxBpm: 122, minEnergy: 0.2, maxEnergy: 0.6 };
    case 'peak':
      return { minBpm: 124, maxBpm: 140, minEnergy: 0.55, maxEnergy: 1.0 };
    case 'afterhours':
    case 'closing':
      return { minBpm: 118, maxBpm: 132, minEnergy: 0.4, maxEnergy: 0.85 };
    case 'unknown':
    default:
      return {};
  }
}

export function applyPreferenceConstraints(
  baseConstraints: RecommendationConstraints,
  signals: PreferenceSignals,
  context: ContextTag,
): RecommendationConstraints {
  const rule = signals.contextRules[context];
  const next: RecommendationConstraints = { ...baseConstraints };
  if (rule?.minBpm != null) next.minBpm = rule.minBpm;
  if (rule?.maxBpm != null) next.maxBpm = rule.maxBpm;
  if (signals.exclusions.length > 0) {
    const excludeGenres = new Set<string>(baseConstraints.excludedGenres ?? []);
    for (const excl of signals.exclusions) {
      if (excl.dimension === 'genre') excludeGenres.add(excl.value);
    }
    next.excludedGenres = Array.from(excludeGenres);
  }
  if (rule?.avoidGenres && rule.avoidGenres.length > 0) {
    const set = new Set(next.excludedGenres ?? []);
    for (const g of rule.avoidGenres) set.add(g);
    next.excludedGenres = Array.from(set);
  }
  if (rule?.boostGenres && rule.boostGenres.length > 0) {
    const set = new Set<string>(next.allowedGenres ?? []);
    for (const g of rule.boostGenres) set.add(g);
    if (next.allowedGenres == null || next.allowedGenres.length > 0) next.allowedGenres = Array.from(set);
  }
  return next;
}

export function clamp01Local(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function clamp100Local(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export interface AdditionalScoringResult {
  personalTransitionScore: number;
  preferenceBoost: number;
  audioFeaturesBoost: number;
  adjustment: number;
  extraReasons: RecommendationReason[];
}

export type PersonalHistoryPort = Pick<LocalDJHistoryStorePort, 'getTransitionsFor'>;

export function reason(
  code: RecommendationReasonCode,
  score: number,
  detail: string,
): RecommendationReason {
  return { code, score: clamp100Local(score), detail };
}

export async function computeAdditionalScoring(
  context: RecommendationContext,
  current: TrackRecommendationCandidate,
  candidate: TrackRecommendationCandidate,
  deps: {
    history?: PersonalHistoryPort;
    preferences?: PreferenceSignals;
    latestAudioFeatures?: Map<string, AudioFeaturesV1>;
    contextTag?: ContextTag;
  },
): Promise<AdditionalScoringResult> {
  const reasons: RecommendationReason[] = [];
  // 1. Personal transition score
  let personalScore = 0.5;
  if (deps.history) {
    const rows = await deps.history.getTransitionsFor(current.trackId);
    const pt = buildPersonalTransitionScore(rows, current.trackId, candidate.trackId);
    if (!pt.fallback && pt.personalScore != null) {
      personalScore = clamp01Local(pt.personalScore);
      reasons.push({
        code: 'artist_diversity',
        score: clamp100Local(personalScore * 100),
        detail: `Personal history success ${(pt.successScore! * 100).toFixed(0)} over ${pt.historyFrequency!} plays.`,
      });
    }
  }

  // 2. Preference boosts/avoids
  let preferenceBoost = 0;
  if (deps.preferences) {
    for (const b of deps.preferences.boosts) {
      if (b.dimension === 'genre' && candidate.genre && candidate.genre.toLowerCase() === b.value) preferenceBoost += clamp01Local(Math.min(0.4, Math.abs(b.totalWeight) / 10)) * 10;
      if (b.dimension === 'artist' && candidate.artist && candidate.artist.toLowerCase() === b.value) preferenceBoost += clamp01Local(Math.min(0.5, Math.abs(b.totalWeight) / 10)) * 12;
      if (b.dimension === 'key' && candidate.key && candidate.key.toLowerCase() === b.value) preferenceBoost += clamp01Local(Math.min(0.4, Math.abs(b.totalWeight) / 10)) * 8;
    }
    for (const a of deps.preferences.avoids) {
      if (a.dimension === 'genre' && candidate.genre && candidate.genre.toLowerCase() === a.value) preferenceBoost -= clamp01Local(Math.min(0.5, Math.abs(a.totalWeight) / 10)) * 10;
      if (a.dimension === 'artist' && candidate.artist && candidate.artist.toLowerCase() === a.value) preferenceBoost -= clamp01Local(Math.min(0.5, Math.abs(a.totalWeight) / 10)) * 12;
    }
    if (preferenceBoost !== 0) {
      reasons.push({
        code: 'constraint_penalty',
        score: clamp100Local(Math.abs(preferenceBoost)),
        detail: preferenceBoost > 0 ? `Preference boost +${preferenceBoost.toFixed(1)}.` : `Preference avoidance penalty ${preferenceBoost.toFixed(1)}.`,
      });
    }
  }

  // 3. Audio features continuity: mood tags + energy
  let audioFeaturesBoost = 0;
  const curr = deps.latestAudioFeatures?.get(current.trackId) ?? null;
  const cand = deps.latestAudioFeatures?.get(candidate.trackId) ?? null;
  if (curr && cand) {
    if (cand.energy != null && curr.energy != null) {
      const continuity = clamp01Local(1 - Math.min(1, Math.abs(cand.energy - curr.energy)));
      audioFeaturesBoost += continuity * 8;
    }
    if (Array.isArray(cand.moodTags) && Array.isArray(curr.moodTags) && curr.moodTags.length > 0) {
      const currentSet = new Set(curr.moodTags);
      const overlap = cand.moodTags.filter((t) => currentSet.has(t)).length;
      const sim = overlap / Math.max(1, currentSet.size);
      audioFeaturesBoost += sim * 10;
    }
    if (audioFeaturesBoost !== 0) {
      reasons.push({
        code: 'semantic_similarity',
        score: clamp100Local(audioFeaturesBoost * 10),
        detail: `Audio features continuity contribution ${audioFeaturesBoost.toFixed(1)}.`,
      });
    }
  }

  // Weighted adjustment applied on top of deterministic base
  const adjustment = clamp100Local(
    personalScore * 15 + clamp01Local(preferenceBoost / 12) * 12 + clamp01Local(audioFeaturesBoost / 18) * 10,
  );

  return {
    personalTransitionScore: clamp100Local(personalScore * 100),
    preferenceBoost: clamp100Local(Math.max(0, preferenceBoost) * 10),
    audioFeaturesBoost: clamp100Local(Math.max(0, audioFeaturesBoost) * 10),
    adjustment,
    extraReasons: reasons,
  };
}

export function scoreCandidateWithSignals(
  base: TrackRecommendation,
  additional: AdditionalScoringResult,
): TrackRecommendation {
  const newScore = clamp100Local((base.hardConstraintPass ? base.score : 0) + additional.adjustment * 0.1);
  return {
    ...base,
    score: base.hardConstraintPass ? newScore : base.score,
    confidence: clamp01Local(newScore / 100),
    reasons: [...base.reasons, ...additional.extraReasons],
  };
}
