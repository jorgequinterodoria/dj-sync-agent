import type { DJReasoningResult } from '../reasoning/reasoning-types.js';
import type {
  CopilotAction,
  CopilotActionContext,
  CopilotActionResult,
} from '../actions/action-types.js';
import type {
  CopilotActionEngine,
} from '../actions/action-engine.js';
import type {
  CopilotActionRepository,
} from './supabase-copilot-action-repository.js';

export interface DJSyncActionServiceSnapshot {
  configured: boolean;
  status: 'disabled' | 'ready' | 'busy' | 'error';
  lastDerivedAt: string | null;
  lastExecutedAt: string | null;
  lastError: string | null;
  lastActionCount: number;
}

export interface DJSyncActionService {
  snapshot(): DJSyncActionServiceSnapshot;

  derive(
    context: CopilotActionContext,
    reasoning: DJReasoningResult,
  ): CopilotAction[];

  execute(
    action: CopilotAction,
    approvalToken?: string | null,
  ): Promise<CopilotActionResult>;
}

export interface CreateDJSyncActionServiceOptions {
  engine: CopilotActionEngine | null;
  repository?: CopilotActionRepository | null;
}

export function createDJSyncActionService(
  options: CreateDJSyncActionServiceOptions,
): DJSyncActionService {
  const configured = options.engine !== null;
  let status: DJSyncActionServiceSnapshot['status'] = configured ? 'ready' : 'disabled';
  let lastDerivedAt: string | null = null;
  let lastExecutedAt: string | null = null;
  let lastError: string | null = null;
  let lastActionCount = 0;

  return {
    snapshot() {
      return {
        configured,
        status,
        lastDerivedAt,
        lastExecutedAt,
        lastError,
        lastActionCount,
      };
    },

    derive(context, reasoning) {
      if (!options.engine) {
        throw new Error('Copilot action engine is not configured.');
      }

      try {
        const actions = options.engine.deriveFromReasoning(context, reasoning);
        lastDerivedAt = new Date().toISOString();
        lastActionCount = actions.length;
        status = 'ready';
        lastError = null;
        return actions;
      } catch (error) {
        status = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },

    async execute(action, approvalToken = null) {
      if (!options.engine) {
        throw new Error('Copilot action engine is not configured.');
      }

      status = 'busy';
      lastError = null;

      try {
        const result = await options.engine.execute(action, approvalToken);
        lastExecutedAt = new Date().toISOString();

        if (options.repository) {
          await options.repository.save({
            deviceId: action.deviceId,
            trackId: action.trackId,
            request:
              typeof action.input.request === 'string'
                ? action.input.request
                : action.rationale,
            action,
            result,
          });
        }

        status = result.status === 'failed' ? 'error' : 'ready';
        lastError = result.error;
        return result;
      } catch (error) {
        status = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
  };
}
