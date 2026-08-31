import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpSemanticEmbeddingProvider } from './semantic-embedding-provider-v2.js';

test('F66.4 HTTP semantic provider maps ordered vectors', async () => {
  const provider = createHttpSemanticEmbeddingProvider({
    endpoint: 'https://embeddings.example.test/v1',
    apiKey: 'test-key',
    model: 'test-embedding',
    dimension: 3,
    fetchImpl: async () => new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [0.4, 0.5, 0.6] },
        { index: 0, embedding: [0.1, 0.2, 0.3] },
      ],
    }), { status: 200 }),
  });
  const vectors = await provider.embed(['a', 'b']);
  assert.equal(provider.dimension, 3);
  assert.deepEqual([...vectors[0]!], [0.1, 0.2, 0.3]);
  assert.deepEqual([...vectors[1]!], [0.4, 0.5, 0.6]);
});

test('F66.5 HTTP semantic provider rejects insecure endpoint and bad dimensions', async () => {
  assert.throws(() => createHttpSemanticEmbeddingProvider({ endpoint: 'http://example.test', apiKey: 'x', model: 'm' }), /HTTPS/);
  const provider = createHttpSemanticEmbeddingProvider({
    endpoint: 'https://example.test', apiKey: 'x', model: 'm', dimension: 2,
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }] }), { status: 200 }),
  });
  await assert.rejects(provider.embed(['x']), /dimension mismatch/i);
});
