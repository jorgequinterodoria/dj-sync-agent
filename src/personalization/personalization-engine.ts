import type {
  LearningEvent,
  PersonalizedTrackProfile,
  PreferenceSignals,
} from './personalization-types.js';

export const PERSONALIZATION_ENGINE_VERSION = '1.0.0';

const POSITIVE_EVENTS = new Set([
  'track_played',
  'recommendation_accepted',
  'set_track_selected',
  'track_rated',
]);

const NEGATIVE_EVENTS = new Set([
  'track_skipped',
  'recommendation_rejected',
]);

function normalize(value: string | null | undefined): string {
  return value?.normalize('NFC').trim().toLocaleLowerCase() ?? '';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const a = sorted[lower];
  const b = sorted[upper];
  if (a === undefined || b === undefined) return null;
  return a + (b - a) * (index - lower);
}

function confidence(sampleCount: number): number {
  return clamp(Math.round((1 - Math.exp(-sampleCount / 8)) * 100));
}

function positiveWeight(event: LearningEvent): number {
  if (event.eventType === 'track_rated' && typeof event.rating === 'number') {
    return Math.max(0, Math.min(5, event.rating)) / 5;
  }
  return POSITIVE_EVENTS.has(event.eventType) ? 1 : 0;
}

function negativeWeight(event: LearningEvent): number {
  return NEGATIVE_EVENTS.has(event.eventType) ? 1 : 0;
}

function topWeighted(values: Array<{ value: string; weight: number }>, limit: number): string[] {
  const totals = new Map<string, number>();
  for (const item of values) {
    totals.set(item.value, (totals.get(item.value) ?? 0) + item.weight);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function buildSignals(events: LearningEvent[]): PreferenceSignals {
  const positive = events.filter((event) => positiveWeight(event) > 0);
  const negative = events.filter((event) => negativeWeight(event) > 0);

  const genres = positive
    .map((event) => ({ value: normalize(event.genre), weight: positiveWeight(event) }))
    .filter((item) => item.value);
  const avoidedGenres = negative
    .map((event) => ({ value: normalize(event.genre), weight: negativeWeight(event) }))
    .filter((item) => item.value);
  const artists = positive
    .map((event) => ({ value: normalize(event.artist), weight: positiveWeight(event) }))
    .filter((item) => item.value);
  const avoidedArtists = negative
    .map((event) => ({ value: normalize(event.artist), weight: negativeWeight(event) }))
    .filter((item) => item.value);

  const bpm = positive
    .map((event) => event.bpm)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const energy = positive
    .map((event) => event.energy)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const keys = positive
    .map((event) => normalize(event.key))
    .filter(Boolean);

  const bpmLow = quantile(bpm, 0.2);
  const bpmHigh = quantile(bpm, 0.8);
  const energyLow = quantile(energy, 0.2);
  const energyHigh = quantile(energy, 0.8);

  return {
    preferredGenres: topWeighted(genres, 8),
    avoidedGenres: unique(topWeighted(avoidedGenres, 8)),
    preferredBpmMin: bpmLow === null ? null : Math.round(bpmLow),
    preferredBpmMax: bpmHigh === null ? null : Math.round(bpmHigh),
    preferredEnergyMin: energyLow === null ? null : Math.round(energyLow * 100) / 100,
    preferredEnergyMax: energyHigh === null ? null : Math.round(energyHigh * 100) / 100,
    preferredKeys: topWeighted(keys.map((value) => ({ value, weight: 1 })), 8),
    preferredArtists: topWeighted(artists, 12),
    avoidedArtists: unique(topWeighted(avoidedArtists, 12)),
  };
}

export function buildPersonalizedTrackProfile(
  deviceId: string,
  events: LearningEvent[],
  now = new Date().toISOString(),
): PersonalizedTrackProfile {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) throw new Error('Personalization requires a device id.');

  const normalizedEvents = events
    .filter((event) => event.deviceId === normalizedDeviceId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));

  const positiveEvents = normalizedEvents.filter((event) => positiveWeight(event) > 0).length;
  const negativeEvents = normalizedEvents.filter((event) => negativeWeight(event) > 0).length;

  const positive = normalizedEvents.filter((event) => positiveWeight(event) > 0);
  const bpmSamples = positive.filter((event) => typeof event.bpm === 'number').length;
  const energySamples = positive.filter((event) => typeof event.energy === 'number').length;
  const genreSamples = positive.filter((event) => normalize(event.genre)).length;
  const keySamples = positive.filter((event) => normalize(event.key)).length;
  const artistSamples = positive.filter((event) => normalize(event.artist)).length;

  return {
    schemaVersion: 1,
    engineVersion: PERSONALIZATION_ENGINE_VERSION,
    computedAt: now,
    deviceId: normalizedDeviceId,
    profile: buildSignals(normalizedEvents),
    confidence: {
      genre: confidence(genreSamples),
      bpm: confidence(bpmSamples),
      energy: confidence(energySamples),
      key: confidence(keySamples),
      artist: confidence(artistSamples),
    },
    evidence: {
      totalEvents: normalizedEvents.length,
      positiveEvents,
      negativeEvents,
    },
  };
}
