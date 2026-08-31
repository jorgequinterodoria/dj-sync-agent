import {
  AIProviderError,
} from './ai-errors.js';
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIMessage,
  AIProvider,
} from './ai-provider.js';

interface AnthropicContentBlock {
  type?: unknown;
  text?: unknown;
}

interface AnthropicResponse {
  content?: unknown;
  stop_reason?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  error?: {
    message?: unknown;
  };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
  version?: string;
  timeoutMs?: number;
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly version: string;
  private readonly timeoutMs: number;

  constructor(options: AnthropicProviderOptions) {
    const apiKey = options.apiKey.trim();
    const baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').trim().replace(/\/$/, '');

    if (!apiKey) {
      throw new AIProviderError(
        'not_configured',
        'Anthropic API key is required.',
      );
    }

    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:') {
      throw new AIProviderError(
        'invalid_request',
        'Anthropic base URL must use HTTPS.',
      );
    }

    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.version = options.version ?? '2023-06-01';
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!request.model.trim()) {
      throw new AIProviderError('invalid_request', 'AI model is required.');
    }

    if (request.messages.length === 0) {
      throw new AIProviderError('invalid_request', 'At least one AI message is required.');
    }

    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n')
      .trim();

    const messages: AIMessage[] = request.messages.filter(
      (message) => message.role !== 'system',
    );

    if (messages.length === 0) {
      throw new AIProviderError('invalid_request', 'Anthropic requires a non-system message.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': this.version,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...(system ? { system } : {}),
          max_tokens: request.maxTokens ?? 1024,
          ...(request.temperature === undefined
            ? {}
            : { temperature: request.temperature }),
        }),
      });

      let payload: AnthropicResponse;
      try {
        payload = (await response.json()) as AnthropicResponse;
      } catch (error) {
        throw new AIProviderError(
          'invalid_response',
          'Anthropic returned invalid JSON.',
          { statusCode: response.status, retryable: response.status >= 500, cause: error },
        );
      }

      if (!response.ok) {
        const message =
          typeof payload.error?.message === 'string'
            ? payload.error.message
            : `Anthropic request failed with HTTP ${response.status}.`;

        if (response.status === 401 || response.status === 403) {
          throw new AIProviderError('authentication_failed', message, {
            statusCode: response.status,
          });
        }
        if (response.status === 429) {
          throw new AIProviderError('rate_limited', message, {
            statusCode: response.status,
            retryable: true,
          });
        }
        if (response.status >= 500) {
          throw new AIProviderError('provider_unavailable', message, {
            statusCode: response.status,
            retryable: true,
          });
        }
        throw new AIProviderError('provider_error', message, {
          statusCode: response.status,
        });
      }

      const blocks = Array.isArray(payload.content) ? payload.content : [];
      const text = blocks
        .filter((block): block is AnthropicContentBlock => Boolean(block && typeof block === 'object'))
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');

      if (!text) {
        throw new AIProviderError(
          'invalid_response',
          'Anthropic response does not contain assistant text.',
        );
      }

      const inputTokens =
        typeof payload.usage?.input_tokens === 'number'
          ? payload.usage.input_tokens
          : null;
      const outputTokens =
        typeof payload.usage?.output_tokens === 'number'
          ? payload.usage.output_tokens
          : null;

      return {
        provider: 'anthropic',
        model: request.model,
        text,
        finishReason:
          typeof payload.stop_reason === 'string'
            ? payload.stop_reason
            : null,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens:
            inputTokens !== null && outputTokens !== null
              ? inputTokens + outputTokens
              : null,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIProviderError(
          'provider_unavailable',
          `Anthropic request timed out after ${this.timeoutMs} ms.`,
          { retryable: true, cause: error },
        );
      }

      throw new AIProviderError(
        'provider_unavailable',
        'Unable to reach Anthropic.',
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
