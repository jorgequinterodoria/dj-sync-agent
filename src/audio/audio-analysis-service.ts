import type {
  AudioAnalysis,
  AudioAnalysisPersistenceResult,
} from './audio-analysis.js';
import type { AudioAnalysisPersistencePort } from './audio-analysis-persistence.js';
import type { VerifiedAudioAsset } from './audio-verifier.js';

export interface AudioAnalysisServiceOptions {
  analyzer: (
    filePath: string,
  ) => Promise<AudioAnalysis>;

  verifier?: (
    filePath: string,
  ) => Promise<VerifiedAudioAsset>;

  persistence?: AudioAnalysisPersistencePort;
}

export class AudioAnalysisService {
  private readonly analyzer: (
    filePath: string,
  ) => Promise<AudioAnalysis>;

  private readonly verifier:
    | ((filePath: string) => Promise<VerifiedAudioAsset>)
    | undefined;

  private readonly persistence:
    | AudioAnalysisPersistencePort
    | undefined;

  public constructor(
    options: AudioAnalysisServiceOptions,
  ) {
    this.analyzer = options.analyzer;
    this.verifier = options.verifier;
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

    if (!this.verifier) {
      throw new Error(
        'Audio analysis asset verification is not configured.',
      );
    }

    const asset = await this.verifier(normalizedPath);

    const analysis = await this.analyzer(normalizedPath);

    const persistence = await this.persistence.persist(
      normalizedTrackId,
      analysis,
      asset,
    );

    return {
      analysis,
      persistence,
    };
  }
}