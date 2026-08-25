import type {
  AudioAnalysis,
  AudioAnalysisPersistenceResult,
} from './audio-analysis.js';

export interface AudioAnalysisPersistencePort {
  persist(
    trackId: string,
    analysis: AudioAnalysis,
  ): Promise<AudioAnalysisPersistenceResult>;
}