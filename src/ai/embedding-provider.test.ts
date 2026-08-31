import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EmbeddingProviderError,
} from './embedding-errors.js';
import {
  OpenAIEmbeddingProvider,
} from './openai-embedding-provider.js';

function mockFetch(
  implementation: typeof fetch,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  return () => {
    globalThis.fetch = original;
  };
}

test('embedding provider rejects missing API key', () => {
  assert.throws(
    () =>
      new OpenAIEmbeddingProvider({
        apiKey: '   ',
      }),
    (error: unknown) =>
      error instanceof EmbeddingProviderError &&
      error.code === 'not_configured',
  );
});

test('embedding provider requires HTTPS', () => {
  assert.throws(
    () =>
      new OpenAIEmbeddingProvider({
        apiKey: 'test',
        baseUrl: 'http://localhost:1234/v1',
      }),
    (error: unknown) =>
      error instanceof EmbeddingProviderError &&
      error.code === 'unsupported_url',
  );
});

test('embedding provider maps successful responses', async () => {
  const restore = mockFetch(
    async () =>
      new Response(
        JSON.stringify({
          object: 'list',
          data: [
            {
              object: 'embedding',
              embedding: [0.1, 0.2],
              index: 0,
            },
          ],
          model: 'text-embedding-test',
          usage: {
            prompt_tokens: 4,
            total_tokens: 4,
          },
        }),
        { status: 200 },
      ),
  );

  try {
    const provider = new OpenAIEmbeddingProvider({
      apiKey: 'test',
      dimensions: 2,
    });

    const result = await provider.embed({
      model: 'text-embedding-test',
      input: 'hello',
    });

    assert.deepEqual(result.embeddings, [[0.1, 0.2]]);
    assert.equal(result.model, 'text-embedding-test');
    assert.equal(result.usage.inputTokens, 4);
    assert.equal(result.usage.totalTokens, 4);
  } finally {
    restore();
  }
});

test('embedding provider maps authentication failures', async () => {
  const restore = mockFetch(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            message: 'bad key',
          },
        }),
        { status: 401 },
      ),
  );

  try {
    const provider = new OpenAIEmbeddingProvider({
      apiKey: 'test',
    });

    await assert.rejects(
      () =>
        provider.embed({
          model: 'text-embedding-test',
          input: 'hello',
        }),
      (error: unknown) =>
        error instanceof EmbeddingProviderError &&
        error.code === 'authentication',
    );
  } finally {
    restore();
  }
});
