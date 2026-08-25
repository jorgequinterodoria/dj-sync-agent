import type {
  AudioAnalysis,
  AudioAnalysisPersistence,
  AudioAnalysisPersistenceResult,
  AudioAnalysisServiceOptions,
} from './audio-analysis.js';

export class AudioAnalysisService {
  private readonly analyzer: (
    filePath: string,
  ) => Promise<AudioAnalysis>;

  private readonly persistence:
    | AudioAnalysisPersistence
    | undefined;

  public constructor(
    options: AudioAnalysisServiceOptions,
  ) {
    this.analyzer = options.analyzer;
    this.persistence = options.persistence;
  }

  public async analyze(
    filePath: string,
  ): Promise<AudioAnalysis> {
    const normalizedPath = filePath.trim();

    if (!normalizedPath) {
      throw new Error('Audio file path is required.');
    }

    return this.analyzer(normalizedPath);
  }

  public async analyzeAndPersist(
    trackId: string,
    filePath: string,
  ): Promise<{
    analysis: AudioAnalysis;
    persistence: AudioAnalysisPersistenceResult;
  }> {
    const normalizedTrackId = trackId.trim();
    const normalizedPath = filePath.trim();

    if (!normalizedTrackId) {
      throw new Error('Track ID is required.');
    }

    if (!normalizedPath) {
      throw new Error('Audio file path is required.');
    }

    if (!this.persistence) {
      throw new Error(
        'Audio analysis persistence is not configured.',
      );
    }

    const analysis = await this.analyzer(normalizedPath);

    const persistence = await this.persistence.persist(
      normalizedTrackId,
      analysis,
    );

    return {
      analysis,
      persistence,
    };
  }
}