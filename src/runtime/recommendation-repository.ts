import type {
  RecommendationResult,
  SetIntelligenceResult,
} from '../recommendations/recommendation-types.js';

export interface RecommendationRepository {
  saveRecommendation(input: {
    deviceId: string;
    currentTrackId: string;
    request: string;
    result: RecommendationResult;
  }): Promise<number>;

  saveSetIntelligence(input: {
    deviceId: string;
    request: string;
    result: SetIntelligenceResult;
  }): Promise<number>;
}
