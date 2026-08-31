import {
  AIProviderError,
} from '../ai/ai-errors.js';
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
  AIProviderId,
} from '../ai/ai-provider.js';

export interface DJSyncAIServiceSnapshot {
  configured: boolean;
  provider: AIProviderId | null;
  status: 'disabled' | 'ready' | 'busy' | 'error';
  lastRequestAt: string | null;
  lastResponseAt: string | null;
  lastError: string | null;
}

export interface DJSyncAIService {
  snapshot(): DJSyncAIServiceSnapshot;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

export interface DJSyncAIServiceOptions {
  provider: AIProvider | null;
}

export function createDJSyncAIService(
  options: DJSyncAIServiceOptions,
): DJSyncAIService {
  const provider = options.provider;
  let status: DJSyncAIServiceSnapshot['status'] = provider === null ? 'disabled' : 'ready';
  let lastRequestAt: string | null = null;
  let lastResponseAt: string | null = null;
  let lastError: string | null = null;

  return {
    snapshot() {
      return {
        configured: provider !== null,
        provider: provider?.id ?? null,
        status,
        lastRequestAt,
        lastResponseAt,
        lastError,
      };
    },

    async complete(request) {
      if (provider === null) {
        throw new AIProviderError(
          'not_configured',
          'AI provider is not configured.',
        );
      }

      status = 'busy';
      lastRequestAt = new Date().toISOString();
      lastError = null;

      try {
        const response = await provider.complete(request);
        lastResponseAt = new Date().toISOString();
        status = 'ready';
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        status = 'error';
        throw error;
      }
    },
  };
}
