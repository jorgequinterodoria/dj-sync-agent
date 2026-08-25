import type {
  AudioAnalysis,
  AudioAnalysisPersistenceResult,
} from './audio-analysis.js';
import type { VerifiedAudioAsset } from './audio-verifier.js';

export interface AudioAnalysisPersistencePort {
  persist(
    trackId: string,
    analysis: AudioAnalysis,
    asset: VerifiedAudioAsset,
  ): Promise<AudioAnalysisPersistenceResult>;
}