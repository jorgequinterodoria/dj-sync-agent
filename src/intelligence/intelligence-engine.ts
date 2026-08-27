import type { NormalizedTrack } from '../rekordbox/normalized-track.js';
import type {
  LatestAnalysis,
  LatestFeature,
} from '../runtime/dj-sync-intelligence.js';

export const INTELLIGENCE_ENGINE_VERSION = '1.0.0';

export type TempoBand =
  | 'very_slow'
  | 'slow'
  | 'mid'
  | 'fast'
  | 'very_fast'
  | 'unknown';

export type DurationBand =
  | 'short'
  | 'standard'
  | 'long'
  | 'very_long'
  | 'unknown';

export type AudioQualityTier =
  | 'lossy_low'
  | 'lossy_standard'
  | 'lossy_high'
  | 'lossless'
  | 'unknown';

export interface IntelligenceSignals {
  energy: number | null;
  danceability: number | null;
  valence: number | null;
  loudnessLufs: number | null;
  spectralCentroidHz: number | null;
  instrumentalness: number | null;
  speechiness: number | null;
  acousticness: number | null;
}

export interface TrackIntelligenceProfile {
  schemaVersion: 1;
  engineVersion: string;
  computedAt: string;

  metadata: {
    completenessScore: number;
    presentFields: number;
    totalFields: number;
  };

  technical: {
    completenessScore: number;
    availableFields: number;
    totalFields: number;
  };

  analysis: {
    available: boolean;
    status: string | null;
    analysisRunId: number | null;
    analysisVersion: number | null;
    pipelineVersion: string | null;
    featureCount: number;
  };

  dj: {
    readinessScore: number;
    engagementScore: number;
    tempoBand: TempoBand;
    durationBand: DurationBand;
    keyPresent: boolean;
    genrePresent: boolean;
    artistPresent: boolean;
    fingerprintReady: boolean;
  };

  audio: {
    qualityTier: AudioQualityTier;
    bitrateKbps: number | null;
    sampleRateHz: number | null;
    channels: number | null;
    codec: string | null;
  };

  signals: IntelligenceSignals;

  provenance: {
    trackHash: string | null;
    rbLocalUsn: number | null;
    analysisRunId: number | null;
    analysisVersion: number | null;
    pipelineVersion: string | null;
  };
}

interface ProfileInput {
  track: NormalizedTrack;
  latestAnalysis: LatestAnalysis;
  latestFeatures: LatestFeature[];
  now?: string;
}

const METADATA_FIELDS = [
  'title',
  'artist',
  'album',
  'genre',
  'label',
  'key',
  'remixer',
  'composer',
  'isrc',
] as const;

const TECHNICAL_FIELDS = [
  'bpm',
  'lengthSeconds',
  'bitrate',
  'sampleRate',
  'rating',
  'playCount',
  'fileType',
] as const;

function present(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return value !== null && value !== undefined;
}

function scoreCompleteness(values: unknown[]): number {
  if (values.length === 0) return 0;
  const count = values.filter(present).length;
  return roundScore((count / values.length) * 100);
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function tempoBand(bpm: number | null): TempoBand {
  if (bpm === null || !Number.isFinite(bpm) || bpm <= 0) return 'unknown';
  if (bpm < 80) return 'very_slow';
  if (bpm < 105) return 'slow';
  if (bpm < 125) return 'mid';
  if (bpm < 145) return 'fast';
  return 'very_fast';
}

function durationBand(seconds: number | null): DurationBand {
  if (
    seconds === null ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return 'unknown';
  }

  if (seconds < 180) return 'short';
  if (seconds < 300) return 'standard';
  if (seconds < 420) return 'long';
  return 'very_long';
}

function audioQualityTier(
  codec: string | null,
  bitrate: number | null,
): AudioQualityTier {
  const normalizedCodec = codec?.trim().toLowerCase() ?? null;

  if (
    normalizedCodec !== null &&
    ['wav', 'aiff', 'flac', 'alac', 'pcm'].includes(normalizedCodec)
  ) {
    return 'lossless';
  }

  if (bitrate === null || bitrate <= 0) return 'unknown';
  if (bitrate < 96000) return 'lossy_low';
  if (bitrate < 192000) return 'lossy_standard';
  return 'lossy_high';
}

function getFeatureNumber(
  features: LatestFeature[],
  aliases: string[],
): number | null {
  const aliasSet = new Set(aliases.map((value) => value.toLowerCase()));

  const match = [...features]
    .reverse()
    .find((feature) => {
      const group = feature.featureGroup?.toLowerCase() ?? '';
      const key = feature.featureKey?.toLowerCase() ?? '';
      return aliasSet.has(key) || aliasSet.has(`${group}.${key}`);
    });

  return match?.numericValue ?? null;
}

function buildSignals(features: LatestFeature[]): IntelligenceSignals {
  return {
    energy: getFeatureNumber(features, ['energy', 'audio.energy']),
    danceability: getFeatureNumber(features, ['danceability', 'audio.danceability']),
    valence: getFeatureNumber(features, ['valence', 'audio.valence']),
    loudnessLufs: getFeatureNumber(features, ['loudness_lufs', 'loudness', 'audio.loudness_lufs']),
    spectralCentroidHz: getFeatureNumber(features, [
      'spectral_centroid',
      'spectral_centroid_hz',
      'audio.spectral_centroid',
    ]),
    instrumentalness: getFeatureNumber(features, [
      'instrumentalness',
      'audio.instrumentalness',
    ]),
    speechiness: getFeatureNumber(features, ['speechiness', 'audio.speechiness']),
    acousticness: getFeatureNumber(features, ['acousticness', 'audio.acousticness']),
  };
}

function engagementScore(
  rating: number | null,
  playCount: number | null,
): number {
  const ratingScore =
    rating === null
      ? 0
      : Math.max(0, Math.min(100, (rating / 5) * 100));

  const plays =
    playCount === null || playCount < 0 ? 0 : playCount;
  const playScore = Math.min(100, Math.log10(plays + 1) * 40);

  return roundScore(ratingScore * 0.65 + playScore * 0.35);
}


export function buildTrackIntelligenceProfileFromJobPayload(
  payload: unknown,
  rbLocalUsn: number | null,
): TrackIntelligenceProfile {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Intelligence job payload is required.');
  }

  const root = payload as Record<string, unknown>;
  const state =
    root.currentState && typeof root.currentState === 'object'
      ? (root.currentState as Record<string, unknown>)
      : null;

  if (!state) {
    throw new Error('Intelligence job currentState is required.');
  }

  const metadata = {
    title: typeof state.title === 'string' ? state.title : null,
    artist: typeof state.artist === 'string' ? state.artist : null,
    album: typeof state.album === 'string' ? state.album : null,
    genre: typeof state.genre === 'string' ? state.genre : null,
    label: null,
    key: typeof state.key === 'string' ? state.key : null,
    remixer: typeof state.remixer === 'string' ? state.remixer : null,
    composer: null,
    isrc: null,
  };

  const technical = {
    bpmRaw: typeof state.bpm === 'number' ? state.bpm : null,
    bpm: typeof state.bpm === 'number' ? state.bpm : null,
    lengthSeconds:
      typeof state.lengthSeconds === 'number' ? state.lengthSeconds : null,
    bitrate: typeof state.bitrate === 'number' ? state.bitrate * 1000 : null,
    bitDepth: null,
    sampleRate:
      typeof state.sampleRate === 'number' ? state.sampleRate : null,
    rating: typeof state.rating === 'number' ? state.rating : null,
    playCount: typeof state.playCount === 'number' ? state.playCount : null,
    fileType: null,
    analyzed: 1,
  };

  const identity = {
    id: typeof root.trackId === 'string' ? root.trackId : '',
    uuid: typeof root.trackUuid === 'string' ? root.trackUuid : '',
  };

  if (!identity.id) {
    throw new Error('Intelligence job trackId is required.');
  }

  const rawFeatures = Array.isArray(root.featureSnapshot)
    ? root.featureSnapshot
    : [];

  const latestFeatures: LatestFeature[] = rawFeatures
    .filter((value) => value && typeof value === 'object')
    .map((value) => value as LatestFeature);

  const analysisContext =
    root.analysisContext && typeof root.analysisContext === 'object'
      ? (root.analysisContext as Record<string, unknown>)
      : {};

  const latestAnalysis: LatestAnalysis = {
    analysisRunId:
      typeof analysisContext.analysisRunId === 'number'
        ? analysisContext.analysisRunId
        : null,
    deviceId:
      typeof root.deviceId === 'string' ? root.deviceId : null,
    trackId: identity.id,
    sourceEventId:
      typeof root.eventId === 'string' ? root.eventId : null,
    sourceRbLocalUsn: rbLocalUsn,
    trackHash:
      typeof root.trackHash === 'string' ? root.trackHash : null,
    analysisVersion:
      typeof analysisContext.analysisVersion === 'number'
        ? analysisContext.analysisVersion
        : null,
    pipelineVersion:
      typeof analysisContext.pipelineVersion === 'string'
        ? analysisContext.pipelineVersion
        : null,
    executionContext: 'desktop',
    status:
      typeof analysisContext.status === 'string'
        ? analysisContext.status
        : null,
    startedAt: null,
    completedAt:
      typeof analysisContext.completedAt === 'string'
        ? analysisContext.completedAt
        : null,
    lastError: null,
    createdAt: null,
    updatedAt: null,
  };

  return buildTrackIntelligenceProfile({
    track: {
      schemaVersion: 1,
      identity,
      metadata,
      technical,
      primaryFile: {
        id: 'job',
        path: '',
        localPath: '',
        hash: null,
        size: 0,
        kind: 'media',
      },
      files: [],
      cues: [],
      playlists: [],
      sync: {
        rbLocalDeleted: 0,
        rbLocalUsn: rbLocalUsn ?? 0,
        updatedAt: new Date().toISOString(),
      },
    } as NormalizedTrack,
    latestAnalysis,
    latestFeatures,
  });
}

export function buildTrackIntelligenceProfile(
  input: ProfileInput,
): TrackIntelligenceProfile {
  const {
    track,
    latestAnalysis,
    latestFeatures,
  } = input;

  const metadataValues = METADATA_FIELDS.map((field) => {
    if (field === 'title') return track.metadata.title;
    if (field === 'artist') return track.metadata.artist;
    if (field === 'album') return track.metadata.album;
    if (field === 'genre') return track.metadata.genre;
    if (field === 'label') return track.metadata.label;
    if (field === 'key') return track.metadata.key;
    if (field === 'remixer') return track.metadata.remixer;
    if (field === 'composer') return track.metadata.composer;
    return track.metadata.isrc;
  });

  const technicalValues = TECHNICAL_FIELDS.map((field) => {
    return track.technical[field];
  });

  const metadataScore = scoreCompleteness(metadataValues);
  const technicalScore = scoreCompleteness(technicalValues);
  const analysisAvailable = latestAnalysis.status === 'completed';
  const featureCount = latestFeatures.length;

  const readinessScore = roundScore(
    metadataScore * 0.30 +
      technicalScore * 0.25 +
      (analysisAvailable ? 35 : 0) +
      Math.min(10, featureCount),
  );

  const signals = buildSignals(latestFeatures);
  const features = latestFeatures;
  const codecFeature = latestFeatures.find(
    (feature) =>
      feature.featureKey?.toLowerCase() === 'codec' &&
      feature.textValue,
  );

  const bitrateKbps =
    track.technical.bitrate === null
      ? null
      : track.technical.bitrate / 1000;

  const qualityTier = audioQualityTier(
    codecFeature?.textValue ?? null,
    track.technical.bitrate,
  );

  const computedAt = input.now ?? new Date().toISOString();

  return {
    schemaVersion: 1,
    engineVersion: INTELLIGENCE_ENGINE_VERSION,
    computedAt,

    metadata: {
      completenessScore: metadataScore,
      presentFields: metadataValues.filter(present).length,
      totalFields: METADATA_FIELDS.length,
    },

    technical: {
      completenessScore: technicalScore,
      availableFields: technicalValues.filter(present).length,
      totalFields: TECHNICAL_FIELDS.length,
    },

    analysis: {
      available: analysisAvailable,
      status: latestAnalysis.status,
      analysisRunId: latestAnalysis.analysisRunId,
      analysisVersion: latestAnalysis.analysisVersion,
      pipelineVersion: latestAnalysis.pipelineVersion,
      featureCount,
    },

    dj: {
      readinessScore,
      engagementScore: engagementScore(
        track.technical.rating,
        track.technical.playCount,
      ),
      tempoBand: tempoBand(track.technical.bpm),
      durationBand: durationBand(track.technical.lengthSeconds),
      keyPresent: present(track.metadata.key),
      genrePresent: present(track.metadata.genre),
      artistPresent: present(track.metadata.artist),
      fingerprintReady:
        present(track.identity.uuid) &&
        present(latestAnalysis.trackHash),
    },

    audio: {
      qualityTier,
      bitrateKbps,
      sampleRateHz: track.technical.sampleRate,
      channels: getFeatureNumber(features, ['channels', 'audio.channels']),
      codec: codecFeature?.textValue ?? null,
    },

    signals,

    provenance: {
      trackHash: latestAnalysis.trackHash,
      rbLocalUsn:
        latestAnalysis.sourceRbLocalUsn ??
        track.sync.rbLocalUsn ??
        null,
      analysisRunId: latestAnalysis.analysisRunId,
      analysisVersion: latestAnalysis.analysisVersion,
      pipelineVersion: latestAnalysis.pipelineVersion,
    },
  };
}
