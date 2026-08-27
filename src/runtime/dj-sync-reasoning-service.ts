import type {
  DJReasoningContext,
  DJReasoningResult,
  DJReasoningRunRecord,
} from '../reasoning/reasoning-types.js';
import type {
  DJReasoningEngine,
} from '../reasoning/dj-reasoning-engine.js';
import type {
  DJReasoningRepository,
} from './supabase-reasoning-repository.js';

export interface DJSyncReasoningServiceSnapshot {
  configured: boolean;
  status: 'disabled' | 'ready' | 'busy' | 'error';
  lastReasonedAt: string | null;
  lastSavedAt: string | null;
  lastError: string | null;
}

export interface DJSyncReasoningService {
  snapshot(): DJSyncReasoningServiceSnapshot;
  reason(input: DJReasoningContext): Promise<DJReasoningResult>;
}

export interface CreateDJSyncReasoningServiceOptions {
  engine: DJReasoningEngine | null;
  repository?: DJReasoningRepository | null;
}

export function createDJSyncReasoningService(
  options: CreateDJSyncReasoningServiceOptions,
): DJSyncReasoningService {
  const configured = options.engine !== null;
  let status: DJSyncReasoningServiceSnapshot['status'] =
    configured ? 'ready' : 'disabled';
  let lastReasonedAt: string | null = null;
  let lastSavedAt: string | null = null;
  let lastError: string | null = null;

  return {
    snapshot() {
      return {
        configured,
        status,
        lastReasonedAt,
        lastSavedAt,
        lastError,
      };
    },

    async reason(input) {
      if (!options.engine) {
        throw new Error('DJ reasoning is not configured.');
      }

      status = 'busy';
      lastError = null;

      try {
        const result = await options.engine.reason(input);
        lastReasonedAt = new Date().toISOString();

        if (options.repository) {
          const deviceId = input.deviceId?.trim() ?? '';
          if (!deviceId) {
            throw new Error('DJ reasoning persistence requires a device id.');
          }

          await options.repository.save({
            deviceId,
            trackId:
              input.trackId.trim(),
            request:
              input.userRequest.trim(),
            result,
          });
          lastSavedAt = new Date().toISOString();
        }

        status = 'ready';
        return result;
      } catch (error) {
        status = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
  };
}
