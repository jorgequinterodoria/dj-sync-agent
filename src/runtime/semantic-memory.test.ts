import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AIEmbeddingProvider,
} from '../ai/embedding-provider.js';
import type {
  SemanticDocument,
} from '../intelligence/semantic-document.js';
import {
  createSemanticMemoryService,
} from './semantic-memory.js';

const document: SemanticDocument = {
  schemaVersion: 1,
  documentType: 'dj.track',
  content: '{"track":"65456953"}',
  contentHash: 'abc',
  trackId: '65456953',
  trackHash: 'hash',
  metadata: {},
};

function provider(): AIEmbeddingProvider {
  return {
    id: 'test',
    dimensions: 3,
    async embed() {
      return {
        model: 'test-model',
        embeddings: [[0.1, 0.2, 0.3]],
        usage: {
          inputTokens: 4,
          totalTokens: 4,
        },
      };
    },
  };
}

test('semantic memory reports missing provider', async () => {
  const service = createSemanticMemoryService({
    provider: null,
    repository: {
      async upsert() {
        throw new Error('should not execute');
      },
      async search() {
        throw new Error('should not execute');
      },
    },
  });

  await assert.rejects(
    () =>
      service.embedTrack({
        deviceId: 'device-1',
        document,
        model: 'test-model',
      }),
    /Embedding provider is not configured/,
  );
});

test('semantic memory embeds and persists a track', async () => {
  let received: number[] = [];

  const service = createSemanticMemoryService({
    provider: provider(),
    repository: {
      async upsert(input) {
        received = input.embedding;
        return {
          id: 1,
          deviceId: input.deviceId,
          trackId: input.document.trackId,
          trackHash: input.document.trackHash,
          documentHash: input.document.contentHash,
          embeddingModel: input.embeddingModel,
          dimensions: input.embedding.length,
          similarity: null,
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        };
      },
      async search() {
        return [];
      },
    },
  });

  const result = await service.embedTrack({
    deviceId: 'device-1',
    document,
    model: 'test-model',
  });

  assert.deepEqual(received, [0.1, 0.2, 0.3]);
  assert.equal(result.trackId, '65456953');
  assert.equal(result.dimensions, 3);
});

test('semantic memory clamps search parameters', async () => {
  let parameters: {
    limit: number;
    minSimilarity: number;
  } | null = null;

  const service = createSemanticMemoryService({
    provider: provider(),
    repository: {
      async upsert() {
        throw new Error('unused');
      },
      async search(input) {
        parameters = {
          limit: input.limit,
          minSimilarity: input.minSimilarity,
        };
        return [];
      },
    },
  });

  await service.search({
    deviceId: 'device-1',
    query: 'house track',
    model: 'test-model',
    limit: 500,
    minSimilarity: 4,
  });

  assert.deepEqual(parameters, {
    limit: 50,
    minSimilarity: 1,
  });
});
