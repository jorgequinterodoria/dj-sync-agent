import type {
  RecommendationConstraints,
  RecommendationResult,
  TrackRecommendationCandidate,
  RecommendationContext,
} from '../../recommendations/recommendation-types.js';
import {
  createRecommendationEngine,
} from '../../recommendations/recommendation-engine.js';
import type {
  LiveDJContextSnapshotPublic,
  LiveSlot,
} from './live-dj-context-state.js';
import {
  deriveBpmRangeFromSlot,
  deriveEnergyRangeFromSlot,
} from './live-dj-context-state.js';
import type {
  ContextTag,
  PreferenceSignals,
} from '../../intelligence/dj-intelligence-v2.js';
import {
  applyPreferenceConstraints,
} from '../../intelligence/dj-intelligence-v2.js';
import type { LiveNowPlaying } from './now-playing-port.js';

export const LIVE_RECOMMEND_V1_LIMIT_DEFAULT = 8 as const;
export const LIVE_RECOMMEND_V1_RECENT_TRACK_EXCLUDE_WINDOW = 10 as const;
export const LIVE_RECOMMEND_V1_COOLDOWN_ENERGY_DELTA_MAX_POSITIVE = -0.01 as const;

export function buildCurrentTrackCandidateFromLiveNowPlaying(
  np: LiveNowPlaying | null,
): TrackRecommendationCandidate | null {
  if (!np || !np.trackId.trim()) return null;
  return {
    trackId: np.trackId.trim(),
    title: np.title ?? null,
    artist: np.artist ?? null,
    bpm: np.bpm ?? null,
    key: np.musicalKey ?? null,
    energy: np.energyHint01 ?? null,
  };
}

export interface LiveSlotBundledConstraints {
  constraints: RecommendationConstraints;
  energyRange: {
    minEnergy01: number | null;
    maxEnergy01: number | null;
  };
}

export function buildLiveSlotConstraints(
  ctx: LiveDJContextSnapshotPublic,
  slot: LiveSlot,
  currentTrack: TrackRecommendationCandidate | null,
  options?: {
    recentExcludeWindowSize?: number;
  },
): LiveSlotBundledConstraints {
  const window = Math.max(0, options?.recentExcludeWindowSize ?? LIVE_RECOMMEND_V1_RECENT_TRACK_EXCLUDE_WINDOW);
  const recentTrackIds = ctx.recentPlayedTrackIds.slice(-window).filter(Boolean);
  const bpm = typeof currentTrack?.bpm === 'number' ? currentTrack.bpm : null;
  const e = typeof currentTrack?.energy === 'number' ? currentTrack.energy : null;
  const bpmRange = deriveBpmRangeFromSlot(slot, bpm);
  const energyRangeRaw = deriveEnergyRangeFromSlot(slot, e);
  const constraints: RecommendationConstraints = {
    excludeRecentlyPlayed: true,
  };
  if (bpm != null) {
    const minBpm = Math.max(1, Math.round(bpm + bpmRange.minBpmDelta));
    const maxBpm = Math.max(minBpm + 1, Math.round(bpm + bpmRange.maxBpmDelta));
    constraints.minBpm = minBpm;
    constraints.maxBpm = maxBpm;
    const absDelta = Math.max(Math.abs(bpmRange.minBpmDelta), Math.abs(bpmRange.maxBpmDelta));
    constraints.maxBpmDelta = absDelta + 1;
  }
  if (slot === 'cool_down' && energyRangeRaw.maxEnergy01 != null) {
    constraints.targetEnergy = Math.max(0, energyRangeRaw.maxEnergy01 - 0.05);
  }
  void recentTrackIds;
  return {
    constraints,
    energyRange: {
      minEnergy01: energyRangeRaw.minEnergy01 ?? null,
      maxEnergy01: energyRangeRaw.maxEnergy01 ?? null,
    },
  };
}

export function filterCandidatesByEnergyRange(
  candidates: TrackRecommendationCandidate[],
  range: { minEnergy01: number | null; maxEnergy01: number | null },
): TrackRecommendationCandidate[] {
  if (range.minEnergy01 == null && range.maxEnergy01 == null) return candidates;
  const out: TrackRecommendationCandidate[] = [];
  for (const c of candidates) {
    const e = typeof c.energy === 'number' ? c.energy : null;
    if (e == null) {
      out.push(c);
      continue;
    }
    if (range.minEnergy01 != null && e < range.minEnergy01 - 1e-9) continue;
    if (range.maxEnergy01 != null && e > range.maxEnergy01 + 1e-9) continue;
    out.push(c);
  }
  return out;
}

export interface RecommendLiveInput {
  ctx: LiveDJContextSnapshotPublic;
  slot?: LiveSlot;
  candidates: TrackRecommendationCandidate[];
  currentTrack?: TrackRecommendationCandidate | null;
  request?: string;
  limit?: number;
  preferenceSignals?: PreferenceSignals | null;
  contextTagOverride?: ContextTag | null;
  deviceId?: string;
  recentTrackIdsForExclusion?: readonly string[];
  recentArtistNamesForExclusion?: readonly string[];
}

export function recommendLive(input: RecommendLiveInput): RecommendationResult {
  const slot = input.slot ?? input.ctx.currentSlot ?? 'next_up';
  const current = input.currentTrack ?? buildCurrentTrackCandidateFromLiveNowPlaying(input.ctx.currentNowPlaying ?? null);
  if (!current || !current.trackId.trim()) {
    const engine = createRecommendationEngine({ id: () => `live-${slot}-empty` });
    const recContext: RecommendationContext = {
      deviceId: input.deviceId ?? input.ctx.deviceId,
      currentTrack: { trackId: '__live_empty_current__' },
      request: input.request ?? `live slot=${slot} empty current track`,
      candidates: [],
      limit: 1,
      constraints: {},
    };
    return engine.recommend(recContext);
  }
  const bundled = buildLiveSlotConstraints(input.ctx, slot, current);
  let constraints = bundled.constraints;
  const effectiveTag = input.contextTagOverride ?? input.ctx.derivedContextTag;
  if (input.preferenceSignals) {
    constraints = applyPreferenceConstraints(constraints, input.preferenceSignals, effectiveTag);
  }
  const recentTracksMerged = new Set<string>();
  for (const id of (input.recentTrackIdsForExclusion ?? [])) if (id && id.trim()) recentTracksMerged.add(id.trim());
  for (const id of (input.ctx.recentPlayedTrackIds ?? [])) if (id && id.trim()) recentTracksMerged.add(id.trim());
  const recentTracks = [...recentTracksMerged];
  const recentArtistsMerged = new Set<string>();
  for (const a of (input.recentArtistNamesForExclusion ?? [])) if (a && a.trim()) recentArtistsMerged.add(a.trim());
  const recentArtists = [...recentArtistsMerged];
  const filteredCandidates = filterCandidatesByEnergyRange(input.candidates, bundled.energyRange);
  const limit = Math.max(1, Math.min(50, input.limit ?? LIVE_RECOMMEND_V1_LIMIT_DEFAULT));
  const engine = createRecommendationEngine({
    id: () => `live-${slot}-${input.ctx.sessionId}`,
    now: () => new Date().toISOString(),
  });
  const excludeTrackIdsSet = new Set<string>(constraints.excludeTrackIds ?? []);
  for (const id of recentTracks) excludeTrackIdsSet.add(id);
  const finalConstraints: RecommendationConstraints = {
    ...constraints,
  };
  if (excludeTrackIdsSet.size > 0) finalConstraints.excludeTrackIds = [...excludeTrackIdsSet];
  if (recentArtists.length > 0) finalConstraints.excludedArtistNames = recentArtists;
  let base: RecommendationContext = {
    deviceId: input.deviceId ?? input.ctx.deviceId,
    currentTrack: current,
    request: input.request ?? `live ${slot} session=${input.ctx.sessionId} tag=${effectiveTag}`,
    candidates: filteredCandidates,
    constraints: finalConstraints,
    limit,
  };
  if (recentTracks.length > 0) base.recentTrackIds = [...recentTracks];
  if (recentArtists.length > 0) base.recentArtistNames = [...recentArtists];
  return engine.recommend(base);
}

export function mergeLiveRecommendationBatches(
  nextUp: RecommendationResult,
  afterNext: RecommendationResult | null,
  coolDown: RecommendationResult | null,
): {
  nextUp: RecommendationResult;
  afterNext: RecommendationResult | null;
  coolDown: RecommendationResult | null;
  slotMergedAt: string;
  distinctTrackCount: number;
} {
  const seen = new Set<string>();
  for (const r of nextUp.recommendations) seen.add(r.trackId);
  if (afterNext) {
    for (const r of afterNext.recommendations) seen.add(r.trackId);
  }
  if (coolDown) {
    for (const r of coolDown.recommendations) seen.add(r.trackId);
  }
  return {
    nextUp,
    afterNext,
    coolDown,
    slotMergedAt: new Date().toISOString(),
    distinctTrackCount: seen.size,
  };
}
