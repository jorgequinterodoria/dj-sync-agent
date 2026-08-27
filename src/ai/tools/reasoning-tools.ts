import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';

export interface ReasoningToolAdapter {
  reason(input: {
    readonly trackId: string;
    readonly request: string;
  }): Promise<unknown>;
}

export function createReasoningTools(adapter: ReasoningToolAdapter): readonly AnyToolDefinition[] {
  return [{
    name: 'reasoning.run',
    description: 'Request structured DJ reasoning from the existing reasoning engine.',
    risk: 'read',
    inputSchema: z.object({
      trackId: z.string().trim().min(1),
      request: z.string().trim().min(1).max(4000),
    }).strict(),
    timeoutMs: 30_000,
    execute: (input) => adapter.reason(input),
  }];
}
