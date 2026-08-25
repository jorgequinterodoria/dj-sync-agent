export interface AudioAnalysis {
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  codec: string | null;
}

export interface AudioAnalysisPersistence {
  persist(
    trackId: string,
    analysis: AudioAnalysis,
  ): Promise<AudioAnalysisPersistenceResult>;
}

export interface AudioAnalysisPersistenceResult {
  analysisRunId: number;
  persistedFeatures: number;
}

export interface AudioAnalysisServiceOptions {
  analyzer: (
    filePath: string,
  ) => Promise<AudioAnalysis>;
  persistence?: AudioAnalysisPersistence;
}