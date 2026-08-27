import type {
  RecommendationRepository,
} from './recommendation-repository.js';
import {
  createRecommendationEngine,
  type RecommendationEngine,
} from '../recommendations/recommendation-engine.js';
import type {
  RecommendationContext,
  RecommendationResult,
  SetIntelligenceResult,
  SetTrackInput,
} from '../recommendations/recommendation-types.js';

export interface DJSyncRecommendationServiceSnapshot {
  configured: boolean;
  status: 'disabled' | 'ready' | 'error';
  lastRecommendationAt: string | null;
  lastSetAnalysisAt: string | null;
  lastRecommendationId: string | null;
  lastSetId: string | null;
  lastError: string | null;
}

export interface DJSyncRecommendationService {
  recommend(context: RecommendationContext): Promise<RecommendationResult>;
  analyzeSet(input: {
    deviceId: string;
    request: string;
    tracks: SetTrackInput[];
    durationMinutes?: number | null;
    setId?: string;
  }): Promise<SetIntelligenceResult>;
  snapshot(): DJSyncRecommendationServiceSnapshot;
}

export function createDJSyncRecommendationService(options: {
  engine?: RecommendationEngine | null;
  repository?: RecommendationRepository | null;
  configured?: boolean;
}): DJSyncRecommendationService {
  const engine = options.engine ?? createRecommendationEngine();
  const configured = options.configured ?? Boolean(options.engine || options.repository);

  let status: DJSyncRecommendationServiceSnapshot['status'] = configured ? 'ready' : 'disabled';
  let lastRecommendationAt: string | null = null;
  let lastSetAnalysisAt: string | null = null;
  let lastRecommendationId: string | null = null;
  let lastSetId: string | null = null;
  let lastError: string | null = null;

  return {
    async recommend(context) {
      if (!configured) throw new Error('Recommendation service is not configured.');
      try {
        const result = engine.recommend(context);
        if (options.repository) {
          await options.repository.saveRecommendation({
            deviceId: context.deviceId,
            currentTrackId: context.currentTrack.trackId,
            request: context.request,
            result,
          });
        }
        status = 'ready';
        lastRecommendationAt = result.generatedAt;
        lastRecommendationId = result.recommendationId;
        lastError = null;
        return result;
      } catch (error) {
        status = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },

    async analyzeSet(input) {
      if (!configured) throw new Error('Recommendation service is not configured.');
      try {
        const result = engine.analyzeSet(input);
        if (options.repository) {
          await options.repository.saveSetIntelligence({
            deviceId: input.deviceId,
            request: input.request,
            result,
          });
        }
        status = 'ready';
        lastSetAnalysisAt = result.generatedAt;
        lastSetId = result.setId;
        lastError = null;
        return result;
      } catch (error) {
        status = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },

    snapshot() {
      return {
        configured,
        status,
        lastRecommendationAt,
        lastSetAnalysisAt,
        lastRecommendationId,
        lastSetId,
        lastError,
      };
    },
  };
}
