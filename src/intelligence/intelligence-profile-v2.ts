import type { AudioFeaturesV1, LocalDJHistoryStorePort, LocalDJPreferenceStorePort } from '../core/local-store/ports.js';
import type {
  TrackIntelligenceProfile,
  IntelligenceSignals,
} from './intelligence-engine.js';
import type { TrackAudioFeaturesV1 } from '../core/local-store/ports.js';
import { clamp01Local } from './dj-intelligence-v2.js';

export type ProfileVersion = 1 | 2;

export interface TrackIntelligenceProfileV2 extends Omit<TrackIntelligenceProfile, 'schemaVersion'> {
  schemaVersion: 2;
  audioIntel: {
    schemaVersion: 1;
    analyzerVersion: string | null;
    energy01: number | null;
    danceability01: number | null;
    danceFloorIntensity01: number | null;
    vocalPresence01: number | null;
    instrumentalProbability: number | null;
    moodTags: string[];
    qualityFlags: string[];
    musicalSectionTypes: string[];
    phraseCount: number | null;
  };
}

export const INTELLIGENCE_PROFILE_SCHEMA_V2 = 2 as const;
export const INTELLIGENCE_PROFILE_V2_ANALYZER = 'audio-intel-v1.0.0+heuristics-v1.0.0';

export function isProfileV1(
  profile: TrackIntelligenceProfile | TrackIntelligenceProfileV2,
): profile is TrackIntelligenceProfile & { schemaVersion: 1 } {
  return profile.schemaVersion === 1;
}

export function isProfileV2(
  profile: TrackIntelligenceProfile | TrackIntelligenceProfileV2,
): profile is TrackIntelligenceProfileV2 {
  return profile.schemaVersion === 2;
}

function round4(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

export function upgradeProfileV1ToV2(
  profile: TrackIntelligenceProfile,
  audioFeatures?: AudioFeaturesV1 | TrackAudioFeaturesV1 | null,
): TrackIntelligenceProfileV2 {
  const features = audioFeatures ?? null;
  const signals: IntelligenceSignals = profile.signals ?? {
    energy: null,
    danceability: null,
    valence: null,
    loudnessLufs: null,
    spectralCentroidHz: null,
    instrumentalness: null,
    speechiness: null,
    acousticness: null,
  };
  const baseEnergy = features?.energy ?? signals.energy ?? null;
  const baseDance = features?.danceability ?? signals.danceability ?? null;
  return {
    ...profile,
    schemaVersion: 2,
    engineVersion: profile.engineVersion,
    audioIntel: {
      schemaVersion: 1,
      analyzerVersion: features?.analyzerVersion ?? null,
      energy01: round4(baseEnergy),
      danceability01: round4(baseDance),
      danceFloorIntensity01: round4(features?.danceFloorIntensity ?? null),
      vocalPresence01: round4(features?.vocalPresence ?? null),
      instrumentalProbability: round4(features?.instrumentalProbability ?? null),
      moodTags: Array.isArray(features?.moodTags) ? [...features.moodTags].sort() : [],
      qualityFlags: Array.isArray(features?.qualityFlags) ? [...features.qualityFlags].sort() : [],
      musicalSectionTypes: Array.isArray(features?.musicalSections)
        ? Array.from(new Set(features.musicalSections.map((s) => s.type))).sort()
        : [],
      phraseCount: Array.isArray(features?.phraseBoundariesMs) ? features.phraseBoundariesMs.length : null,
    },
    signals: {
      ...signals,
      energy: baseEnergy != null ? clamp01Local(baseEnergy) : signals.energy,
      danceability: baseDance != null ? clamp01Local(baseDance) : signals.danceability,
    },
  };
}

export interface BuildIntelligenceProfileV2Input {
  base: TrackIntelligenceProfile;
  audioFeatures?: AudioFeaturesV1 | TrackAudioFeaturesV1 | null;
  now?: string;
}

export function buildTrackIntelligenceProfileV2(
  input: BuildIntelligenceProfileV2Input,
): TrackIntelligenceProfileV2 {
  const upgraded = upgradeProfileV1ToV2(input.base, input.audioFeatures ?? null);
  const computedAt = input.now ?? new Date().toISOString();
  return {
    ...upgraded,
    computedAt,
    audioIntel: {
      ...upgraded.audioIntel,
    },
  };
}

export interface DJBehaviorSignals {
  avgPlayCount: number | null;
  avgRating: number | null;
  topGenres: string[];
  strongExclusions: string[];
}

export async function summarizeBehaviorFromPreferences(
  preferences: LocalDJPreferenceStorePort,
  deviceId: string,
): Promise<DJBehaviorSignals> {
  const [genre, artist, label, bpm, energy, exclusions] = await Promise.all([
    preferences.listValues({ deviceId, dimension: 'genre' }),
    preferences.listValues({ deviceId, dimension: 'artist' }),
    preferences.listValues({ deviceId, dimension: 'label' }),
    preferences.listValues({ deviceId, dimension: 'bpm_range' }),
    preferences.listValues({ deviceId, dimension: 'energy_range' }),
    preferences.listValues({ deviceId, dimension: 'track_exclusion' }),
  ]);
  void artist;
  void label;
  void bpm;
  void energy;
  const topGenres = genre
    .filter((row) => row.totalWeight > 0)
    .sort((a, b) => b.totalWeight - a.totalWeight)
    .slice(0, 5)
    .map((r) => r.value);
  const strongExclusions = exclusions
    .filter((row) => row.kind === 'excluded')
    .map((row) => row.value);
  return {
    avgPlayCount: null,
    avgRating: null,
    topGenres,
    strongExclusions,
  };
}

export async function summarizeHistoryForTrack(
  history: LocalDJHistoryStorePort,
  trackId: string,
): Promise<{ transitionedFrom: number; transitionedTo: number; avgSuccessScore: number | null }> {
  const from = await history.getTransitionsFor(trackId);
  // getTransitionsFor returns trackAId=trackId → transitions going from this track; no "to" port yet.
  const combined = [...from];
  const avgSuccess = combined.length > 0
    ? combined.reduce((sum, t) => sum + (t.success_score ?? 0), 0) / combined.length
    : null;
  return {
    transitionedFrom: from.length,
    transitionedTo: 0,
    avgSuccessScore: avgSuccess != null ? Math.round(avgSuccess * 10000) / 10000 : null,
  };
}
