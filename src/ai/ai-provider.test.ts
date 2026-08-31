import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIProviderError,
} from './ai-errors.js';
import {
  createAIProvider,
} from './ai-provider-factory.js';
import {
  OpenAICompatibleProvider,
} from './openai-compatible-provider.js';
import type {
  AICompletionResponse,
  AIProvider,
} from './ai-provider.js';

function response(
  text: string,
): AICompletionResponse {
  return {
    provider: 'openai-compatible',
    model: 'test-model',
    text,
    finishReason: 'stop',
    usage: {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    },
  };
}

test('AI provider factory creates OpenAI provider with default endpoint', () => {
  const provider = createAIProvider({
    provider: 'openai',
    apiKey: 'secret',
  });

  assert.equal(provider.id, 'openai');
});

test('AI provider factory creates Anthropic provider', () => {
  const provider = createAIProvider({
    provider: 'anthropic',
    apiKey: 'secret',
  });

  assert.equal(provider.id, 'anthropic');
});

test('AI provider factory rejects missing API key', () => {
  assert.throws(
    () =>
      createAIProvider({
        provider: 'openai',
        apiKey: '   ',
      }),
    (error: unknown) =>
      error instanceof AIProviderError &&
      error.code === 'not_configured',
  );
});

test('OpenAI-compatible provider rejects non-HTTPS URLs', () => {
  assert.throws(
    () =>
      new OpenAICompatibleProvider({
        id: 'openai-compatible',
        baseUrl: 'http://localhost:1234',
        apiKey: 'secret',
      }),
    /HTTPS/,
  );
});

test('OpenAI-compatible provider maps successful responses', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: 'hello' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 6,
          total_tokens: 10,
        },
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    );

  try {
    const provider = new OpenAICompatibleProvider({
      id: 'openai-compatible',
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
    });

    const result = await provider.complete({
      model: 'test-model',
      messages: [
        {
          role: 'user',
          content: 'hello',
        },
      ],
    });

    assert.equal(result.text, 'hello');
    assert.equal(result.usage.totalTokens, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI-compatible provider maps authentication failures', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: { message: 'bad key' },
      }),
      {
        status: 401,
        headers: {
          'content-type': 'application/json',
        },
      },
    );

  try {
    const provider = new OpenAICompatibleProvider({
      id: 'openai-compatible',
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
    });

    await assert.rejects(
      () =>
        provider.complete({
          model: 'test-model',
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
        }),
      (error: unknown) =>
        error instanceof AIProviderError &&
        error.code === 'authentication_failed' &&
        error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI provider interface remains provider agnostic', async () => {
  const provider: AIProvider = {
    id: 'openai-compatible',
    async complete() {
      return response('mock');
    },
  };

  const result = await provider.complete({
    model: 'mock',
    messages: [
      {
        role: 'user',
        content: 'hello',
      },
    ],
  });

  assert.equal(result.text, 'mock');
});
