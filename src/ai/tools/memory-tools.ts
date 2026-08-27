import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';

export interface MemoryToolAdapter {
  search(input: {
    readonly query: string;
    readonly limit: number;
    readonly minSimilarity?: number;
  }): Promise<unknown>;
}

export function createMemoryTools(adapter: MemoryToolAdapter): readonly AnyToolDefinition[] {
  return [{
    name: 'memory.search',
    description: 'Search semantic DJ memory without exposing embedding internals.',
    risk: 'read',
    inputSchema: z.object({
      query: z.string().trim().min(1).max(2000),
      limit: z.number().int().min(1).max(50).default(10),
      minSimilarity: z.number().min(0).max(1).optional(),
    }).strict(),
    timeoutMs: 15_000,
    execute: (input) => adapter.search(input),
  }];
}
