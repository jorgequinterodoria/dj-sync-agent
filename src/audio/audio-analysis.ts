export interface AudioAnalysis {
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  codec: string | null;
}

export interface AudioAnalysisPersistenceResult {
  analysisRunId: number;
  persistedFeatures: number;
}