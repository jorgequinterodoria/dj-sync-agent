import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';

export interface IntelligenceToolAdapter {
  getTrackIntelligence(trackId: string): Promise<unknown>;
}

export function createIntelligenceTools(
  adapter: IntelligenceToolAdapter,
): readonly AnyToolDefinition[] {
  return [{
    name: 'intelligence.get_track',
    description: 'Read consolidated deterministic intelligence for a track.',
    risk: 'read',
    inputSchema: z.object({ trackId: z.string().trim().min(1) }).strict(),
    timeoutMs: 10_000,
    execute: ({ trackId }) => adapter.getTrackIntelligence(trackId),
  }];
}
