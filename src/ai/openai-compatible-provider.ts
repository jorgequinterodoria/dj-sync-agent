import {
  AIProviderError,
} from './ai-errors.js';
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from './ai-provider.js';

interface OpenAIChoice {
  message?: {
    content?: unknown;
  };
  finish_reason?: unknown;
}

interface OpenAIResponse {
  choices?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
  error?: {
    message?: unknown;
  };
}

export interface OpenAICompatibleProviderOptions {
  id: 'openai' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: OpenAICompatibleProviderOptions['id'];

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAICompatibleProviderOptions) {
    const baseUrl = options.baseUrl.trim().replace(/\/$/, '');
    const apiKey = options.apiKey.trim();

    if (!baseUrl) {
      throw new AIProviderError(
        'not_configured',
        'AI provider base URL is required.',
      );
    }

    if (!apiKey) {
      throw new AIProviderError(
        'not_configured',
        'AI provider API key is required.',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch (error) {
      throw new AIProviderError(
        'invalid_request',
        `Invalid AI provider base URL: ${baseUrl}`,
        { cause: error },
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new AIProviderError(
        'invalid_request',
        'AI provider base URL must use HTTPS.',
      );
    }

    this.id = options.id;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!request.model.trim()) {
      throw new AIProviderError('invalid_request', 'AI model is required.');
    }

    if (request.messages.length === 0) {
      throw new AIProviderError('invalid_request', 'At least one AI message is required.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          ...(request.temperature === undefined
            ? {}
            : { temperature: request.temperature }),
          ...(request.maxTokens === undefined
            ? {}
            : { max_tokens: request.maxTokens }),
        }),
      });

      let payload: OpenAIResponse;
      try {
        payload = (await response.json()) as OpenAIResponse;
      } catch (error) {
        throw new AIProviderError(
          'invalid_response',
          'AI provider returned invalid JSON.',
          { statusCode: response.status, retryable: response.status >= 500, cause: error },
        );
      }

      if (!response.ok) {
        const message =
          typeof payload.error?.message === 'string'
            ? payload.error.message
            : `AI provider request failed with HTTP ${response.status}.`;

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

      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const first = choices[0] as OpenAIChoice | undefined;
      const text = typeof first?.message?.content === 'string' ? first.message.content : null;

      if (text === null) {
        throw new AIProviderError(
          'invalid_response',
          'AI provider response does not contain assistant text.',
        );
      }

      const inputTokens =
        typeof payload.usage?.prompt_tokens === 'number'
          ? payload.usage.prompt_tokens
          : null;
      const outputTokens =
        typeof payload.usage?.completion_tokens === 'number'
          ? payload.usage.completion_tokens
          : null;
      const totalTokens =
        typeof payload.usage?.total_tokens === 'number'
          ? payload.usage.total_tokens
          : null;

      return {
        provider: this.id,
        model: request.model,
        text,
        finishReason:
          typeof first?.finish_reason === 'string'
            ? first.finish_reason
            : null,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIProviderError(
          'provider_unavailable',
          `AI provider request timed out after ${this.timeoutMs} ms.`,
          { retryable: true, cause: error },
        );
      }

      throw new AIProviderError(
        'provider_unavailable',
        'Unable to reach AI provider.',
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
