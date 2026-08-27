import {
  EmbeddingProviderError,
} from './embedding-errors.js';
import type {
  AIEmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from './embedding-provider.js';

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  dimensions?: number;
}

interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenAIEmbeddingProvider implements AIEmbeddingProvider {
  public readonly id = 'openai';
  public readonly dimensions: number;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  public constructor(options: OpenAIEmbeddingProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new EmbeddingProviderError(
        'not_configured',
        'Embedding provider API key is required.',
      );
    }

    const baseUrl = options.baseUrl?.trim() || 'https://api.openai.com/v1';
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch (error) {
      throw new EmbeddingProviderError(
        'unsupported_url',
        `Invalid embedding provider URL: ${baseUrl}`,
        { cause: error },
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new EmbeddingProviderError(
        'unsupported_url',
        `Embedding provider URL must use HTTPS: ${parsed.protocol}`,
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.dimensions = options.dimensions ?? 1536;
  }

  public async embed(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    if (!request.model.trim()) {
      throw new EmbeddingProviderError(
        'invalid_request',
        'Embedding model is required.',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    try {
      const response = await fetch(
        `${this.baseUrl}/embeddings`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model,
            input: request.input,
          }),
          signal: controller.signal,
        },
      );

      const raw = await response.text();
      let payload: unknown;

      try {
        payload = JSON.parse(raw);
      } catch (error) {
        throw new EmbeddingProviderError(
          'invalid_response',
          `Embedding provider returned invalid JSON (HTTP ${response.status}).`,
          { cause: error },
        );
      }

      if (!response.ok) {
        const message =
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          payload.error &&
          typeof payload.error === 'object' &&
          'message' in payload.error
            ? String(payload.error.message)
            : `Embedding provider request failed with HTTP ${response.status}.`;

        if (response.status === 401 || response.status === 403) {
          throw new EmbeddingProviderError('authentication', message);
        }

        if (response.status === 429) {
          throw new EmbeddingProviderError('rate_limited', message);
        }

        if (response.status >= 500) {
          throw new EmbeddingProviderError('unavailable', message);
        }

        throw new EmbeddingProviderError('invalid_request', message);
      }

      if (!payload || typeof payload !== 'object') {
        throw new EmbeddingProviderError(
          'invalid_response',
          'Embedding provider returned an invalid response object.',
        );
      }

      const result = payload as Partial<OpenAIEmbeddingResponse>;
      const data = Array.isArray(result.data) ? result.data : null;

      if (
        !data ||
        data.length === 0 ||
        data.some(
          (item) =>
            !item ||
            !Array.isArray(item.embedding) ||
            item.embedding.some(
              (value) => typeof value !== 'number' || !Number.isFinite(value),
            ),
        )
      ) {
        throw new EmbeddingProviderError(
          'invalid_response',
          'Embedding provider response did not contain valid embeddings.',
        );
      }

      return {
        model:
          typeof result.model === 'string'
            ? result.model
            : request.model,
        embeddings: data
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding),
        usage: {
          inputTokens:
            typeof result.usage?.prompt_tokens === 'number'
              ? result.usage.prompt_tokens
              : null,
          totalTokens:
            typeof result.usage?.total_tokens === 'number'
              ? result.usage.total_tokens
              : null,
        },
      };
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        throw error;
      }

      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        throw new EmbeddingProviderError(
          'network',
          `Embedding provider request timed out after ${this.timeoutMs} ms.`,
          { cause: error },
        );
      }

      throw new EmbeddingProviderError(
        'network',
        `Embedding provider request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
