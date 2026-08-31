import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';

export interface ActionToolAdapter {
  derive(input: { readonly reasoning: unknown }): Promise<unknown>;
  execute(input: { readonly action: unknown; readonly approvalToken?: string }): Promise<unknown>;
}

const actionSchema = z.object({
  action: z.unknown(),
  approvalToken: z.string().trim().min(1).optional(),
}).strict();

export function createActionTools(adapter: ActionToolAdapter): readonly AnyToolDefinition[] {
  return [
    {
      name: 'action.derive',
      description: 'Derive validated Copilot actions from structured reasoning.',
      risk: 'read',
      inputSchema: z.object({ reasoning: z.unknown() }).strict(),
      timeoutMs: 15_000,
      execute: ({ reasoning }) => adapter.derive({ reasoning }),
    },
    {
      name: 'action.execute',
      description: 'Execute an already validated action through the safety boundary.',
      risk: 'execute',
      inputSchema: actionSchema,
      timeoutMs: 30_000,
      execute: ({ action, approvalToken }) => adapter.execute({ action, approvalToken }),
    },
  ];
}
