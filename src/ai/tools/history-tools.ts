import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';
import type { DJHistoryQuery, DJHistoryResult } from '../../core/domain/dj-history.js';

export interface HistoryToolAdapter {
  getHistory(query: DJHistoryQuery): Promise<DJHistoryResult>;
}

const inputSchema = z.object({
  trackId: z.string().trim().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
}).strict();

export function createHistoryTools(
  adapter: HistoryToolAdapter,
): readonly AnyToolDefinition[] {
  return [{
    name: 'history.get',
    description: 'Read bounded DJ play history with optional time filters.',
    risk: 'read',
    inputSchema,
    timeoutMs: 10_000,
    execute: (input) => adapter.getHistory(input),
  }];
}
