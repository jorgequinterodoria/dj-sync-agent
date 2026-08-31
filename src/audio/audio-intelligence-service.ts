import type {
  AudioFeaturesV1,
  LocalAudioAnalysisStorePort,
  LocalAudioFeaturesStorePort,
} from '../core/local-store/ports.js';
import type { AudioAnalysis } from './audio-analysis.js';
import type { VerifiedAudioAsset } from './audio-verifier.js';
import {
  mergeFileAndMusicalFeatures,
  TRACK_AUDIO_FEATURES_SCHEMA_VERSION,
} from './audio-boundaries.js';
export { TRACK_AUDIO_FEATURES_SCHEMA_VERSION } from './audio-boundaries.js';
import {
  runMusicalHeuristicsV1,
  type MoodHeuristicInputs,
} from './audio-musical-heuristics-v1.js';
import type { DJSyncReliability } from '../runtime/dj-sync-reliability.js';

export const MUSICAL_HEURISTICS_V1_ANALYZER_VERSION = 'heuristics-v1.0.0';
export const AUDIO_INTELLIGENCE_ENGINE_VERSION = 'audio-intel-v1.0.0';

export interface TrackAudioMetadataInput {
  trackId: string;
  filePath?: string | null;
  bpm?: number | null;
  musicalKey?: string | null;
  rating?: number | null;
  playCount?: number | null;
  genre?: string | null;
  durationSeconds?: number | null;
}

export interface TrackAudioAnalysisDeps {
  readonly fileAnalyzer?: (filePath: string) => Promise<AudioAnalysis>;
  readonly assetVerifier?: (filePath: string) => Promise<VerifiedAudioAsset>;
  readonly analysisStore?: LocalAudioAnalysisStorePort;
  readonly featuresStore?: LocalAudioFeaturesStorePort;
  readonly reliability?: Pick<DJSyncReliability, 'run'>;
  readonly analyzerVersion?: string;
  readonly schemaVersion?: number;
}

export interface TrackAudioFeaturesResult {
  readonly features: AudioFeaturesV1;
  readonly cacheHit: boolean;
  readonly cacheBasis: {
    readonly persistedChecksum: string | null;
    readonly incomingChecksum: string | null;
  };
}

export async function runTrackAudioFeaturesPipeline(
  meta: TrackAudioMetadataInput,
  deps: TrackAudioAnalysisDeps,
  now?: string,
): Promise<TrackAudioFeaturesResult> {
  const analyzerVersion = deps.analyzerVersion ?? MUSICAL_HEURISTICS_V1_ANALYZER_VERSION;
  const schemaVersion = deps.schemaVersion ?? TRACK_AUDIO_FEATURES_SCHEMA_VERSION;
  const generatedAt = typeof now === 'string' && now.length > 0 ? now : new Date().toISOString();
  const trackId = meta.trackId.trim();

  if (!trackId) {
    throw new Error('Track ID is required for audio intelligence pipeline.');
  }

  // 2. Cache lookup (ANTES de persistir nuevo análisis): get persisted checksum from DB and cached features
  let persistedChecksumBefore: string | null = null;
  if (deps.analysisStore) {
    const latest = await deps.analysisStore.getLatestAnalysis(trackId);
    persistedChecksumBefore = latest ? latest.assetChecksum : null;
  }

  // 1. Run (optional) file analysis → produce fileAnalysis + asset with checksum
  let fileAnalysis: AudioAnalysis | null = null;
  let incomingChecksum: string | null = null;
  let incomingAssetPath: string | null = null;
  let outcomeAsset: VerifiedAudioAsset | null = null;
  let outcomeAnalysis: AudioAnalysis | null = null;
  if (deps.fileAnalyzer && deps.assetVerifier && meta.filePath && meta.filePath.trim().length > 0) {
    const path = meta.filePath.trim();
    const runOp = async () => {
      const asset = await deps.assetVerifier!(path);
      const analysis = await deps.fileAnalyzer!(path);
      return { asset, analysis };
    };
    const outcome = deps.reliability
      ? (await deps.reliability.run(runOp)).value
      : await runOp();
    fileAnalysis = outcome.analysis;
    incomingChecksum = outcome.asset.checksum;
    incomingAssetPath = outcome.asset.path ?? null;
    outcomeAsset = outcome.asset;
    outcomeAnalysis = outcome.analysis;
  }

  const checksumMatchBeforePersist = Boolean(
    incomingChecksum && persistedChecksumBefore && incomingChecksum === persistedChecksumBefore,
  );

  if (checksumMatchBeforePersist && deps.featuresStore) {
    const cached = await deps.featuresStore.getFeatures(trackId);
    if (
      cached &&
      cached.schemaVersion === schemaVersion &&
      cached.analyzerVersion === analyzerVersion &&
      cached.trackId === trackId
    ) {
      // Even if cache hit, store latest file analysis if we ran it (for updated timestamps)
      if (outcomeAsset && outcomeAnalysis && deps.analysisStore) {
        void deps.analysisStore.persistAnalysis(trackId, outcomeAnalysis, outcomeAsset).catch(() => {});
      }
      return {
        features: cached,
        cacheHit: true,
        cacheBasis: { persistedChecksum: persistedChecksumBefore, incomingChecksum },
      };
    }
  }

  // Persist file analysis after cache check, never before the checksum compare
  if (outcomeAsset && outcomeAnalysis && deps.analysisStore) {
    await deps.analysisStore.persistAnalysis(trackId, outcomeAnalysis, outcomeAsset);
  }

  // 3. Cache miss: run musical heuristics pipeline (deterministic)
  const moodInputs: MoodHeuristicInputs = {
    bpm: meta.bpm ?? null,
    musicalKey: meta.musicalKey ?? null,
    rating: meta.rating ?? null,
    playCount: meta.playCount ?? null,
    genre: meta.genre ?? null,
    durationSeconds: meta.durationSeconds ?? fileAnalysis?.durationSeconds ?? null,
    bitrate: fileAnalysis?.bitrate ?? null,
    sampleRate: fileAnalysis?.sampleRate ?? null,
    channels: fileAnalysis?.channels ?? null,
  };

  const musical = runMusicalHeuristicsV1({
    trackId,
    metadata: moodInputs,
    bpm: meta.bpm ?? null,
    durationSeconds: meta.durationSeconds ?? fileAnalysis?.durationSeconds ?? null,
  });

  const features = mergeFileAndMusicalFeatures({
    trackId,
    generatedAt,
    analyzerVersion,
    musical,
  });

  if (deps.featuresStore) {
    await deps.featuresStore.persistFeatures(trackId, features);
  }

  return {
    features,
    cacheHit: false,
    cacheBasis: { persistedChecksum: persistedChecksumBefore, incomingChecksum },
  };
}
