import { randomUUID } from 'node:crypto';

import type { DJReasoningResult } from '../reasoning/reasoning-types.js';
import type {
  CopilotAction,
  CopilotActionContext,
  CopilotActionResult,
  CopilotActionType,
} from './action-types.js';
import { validateCopilotAction } from './action-validator.js';

export interface CopilotActionEngine {
  deriveFromReasoning(
    context: CopilotActionContext,
    reasoning: DJReasoningResult,
  ): CopilotAction[];

  execute(
    action: CopilotAction,
    approvalToken?: string | null,
  ): Promise<CopilotActionResult>;
}

export interface CopilotActionExecutor {
  execute(
    action: CopilotAction,
  ): Promise<Record<string, unknown>>;
}

export interface CopilotActionEngineOptions {
  executor: CopilotActionExecutor;
  now?: () => string;
  id?: () => string;
}

const ACTION_TYPES: ReadonlySet<CopilotActionType> = new Set([
  'audio.analyze',
  'intelligence.refresh',
  'memory.index',
  'reasoning.run',
]);

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function typeForDecision(
  type: DJReasoningResult['decisions'][number]['type'],
): CopilotActionType | null {
  switch (type) {
    case 'investigate':
      return 'audio.analyze';
    case 'suggest':
      return 'reasoning.run';
    case 'keep':
    case 'prefer':
      return 'intelligence.refresh';
    case 'avoid':
      return 'memory.index';
    default:
      return null;
  }
}

export function createCopilotActionEngine(
  options: CopilotActionEngineOptions,
): CopilotActionEngine {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.id ?? randomUUID;

  return {
    deriveFromReasoning(context, reasoning) {
      const deviceId = context.deviceId.trim();
      const trackId = context.trackId.trim();
      const request = context.request.trim();

      if (!deviceId) throw new Error('Copilot action device id is required.');
      if (!trackId) throw new Error('Copilot action track id is required.');
      if (!request) throw new Error('Copilot action request is required.');

      const generated: CopilotAction[] = [];

      for (const decision of reasoning.decisions) {
        const type = typeForDecision(decision.type);
        if (!type || !ACTION_TYPES.has(type)) continue;

        const action: CopilotAction = {
          schemaVersion: 1,
          actionId: createId(),
          engineVersion: '1.0.0',
          type,
          risk: 'safe',
          requiresApproval: false,
          deviceId,
          trackId,
          input: {
            request,
            reasoningId: reasoning.reasoningId,
            subject: decision.subject,
            rationale: decision.rationale,
          },
          rationale: decision.rationale,
          confidence: clampConfidence(decision.confidence),
          createdAt: now(),
        };

        generated.push(validateCopilotAction(action));
      }

      return generated;
    },

    async execute(action, approvalToken = null) {
      const validated = validateCopilotAction(action);
      const startedAt = now();

      if (validated.requiresApproval && !approvalToken?.trim()) {
        return {
          schemaVersion: 1,
          actionId: validated.actionId,
          actionType: validated.type,
          status: 'rejected',
          output: {},
          error: 'approval_required',
          startedAt,
          completedAt: now(),
        };
      }

      try {
        const output = await options.executor.execute(validated);
        return {
          schemaVersion: 1,
          actionId: validated.actionId,
          actionType: validated.type,
          status: 'completed',
          output,
          error: null,
          startedAt,
          completedAt: now(),
        };
      } catch (error) {
        return {
          schemaVersion: 1,
          actionId: validated.actionId,
          actionType: validated.type,
          status: 'failed',
          output: {},
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          completedAt: now(),
        };
      }
    },
  };
}
