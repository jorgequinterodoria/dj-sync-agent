import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';

export interface RecommendationToolAdapter {
  recommend(input: {
    readonly trackId: string;
    readonly limit: number;
    readonly bpmMin?: number;
    readonly bpmMax?: number;
    readonly excludeRecentlyPlayed?: boolean;
  }): Promise<unknown>;
  analyzeSet(input: { readonly trackIds: readonly string[] }): Promise<unknown>;
}

export function createRecommendationTools(
  adapter: RecommendationToolAdapter,
): readonly AnyToolDefinition[] {
  return [
    {
      name: 'recommendation.get',
      description: 'Generate deterministic track recommendations using the existing engine.',
      risk: 'read',
      inputSchema: z.object({
        trackId: z.string().trim().min(1),
        limit: z.number().int().min(1).max(50).default(10),
        bpmMin: z.number().finite().optional(),
        bpmMax: z.number().finite().optional(),
        excludeRecentlyPlayed: z.boolean().default(true),
      }).strict(),
      timeoutMs: 15_000,
      execute: (input) => adapter.recommend(input),
    },
    {
      name: 'recommendation.analyze_set',
      description: 'Analyze a bounded set of track ids for continuity and repetition.',
      risk: 'read',
      inputSchema: z.object({
        trackIds: z.array(z.string().trim().min(1)).min(1).max(200),
      }).strict(),
      timeoutMs: 15_000,
      execute: (input) => adapter.analyzeSet(input),
    },
  ];
}
