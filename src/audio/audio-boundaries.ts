import type { AudioAnalysis } from './audio-analysis.js';
import type { AudioFeaturesV1, MusicalSectionV1 } from '../core/local-store/ports.js';

export type FileAudioAnalysis = AudioAnalysis;

export interface MusicalAudioFeaturesResult {
  energy: number | null;
  danceability: number | null;
  danceFloorIntensity: number | null;
  rhythmicDensity: number | null;
  moodTags: string[];
  vocalPresence: number | null;
  instrumentalProbability: number | null;
  musicalSections: MusicalSectionV1[] | null;
  phraseBoundariesMs: number[] | null;
  qualityFlags: string[];
}

export interface MusicalFeaturesAnalyzer {
  (input: {
    trackId: string;
    fileAnalysis: FileAudioAnalysis | null;
    metadata: {
      bpm: number | null;
      musicalKey: string | null;
      rating: number | null;
      playCount: number | null;
      genre: string | null;
      durationSeconds: number | null;
    };
  }): Promise<MusicalAudioFeaturesResult>;
}

export const TRACK_AUDIO_FEATURES_SCHEMA_VERSION = 1;

export function mergeFileAndMusicalFeatures(args: {
  trackId: string;
  generatedAt: string;
  analyzerVersion: string;
  musical: MusicalAudioFeaturesResult;
}): AudioFeaturesV1 {
  return {
    schemaVersion: TRACK_AUDIO_FEATURES_SCHEMA_VERSION,
    trackId: args.trackId,
    generatedAt: args.generatedAt,
    analyzerVersion: args.analyzerVersion,
    energy: args.musical.energy,
    danceability: args.musical.danceability,
    danceFloorIntensity: args.musical.danceFloorIntensity,
    rhythmicDensity: args.musical.rhythmicDensity,
    moodTags: args.musical.moodTags,
    vocalPresence: args.musical.vocalPresence,
    instrumentalProbability: args.musical.instrumentalProbability,
    musicalSections: args.musical.musicalSections,
    phraseBoundariesMs: args.musical.phraseBoundariesMs,
    qualityFlags: args.musical.qualityFlags,
  };
}
