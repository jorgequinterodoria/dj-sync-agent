import type {
  AIEmbeddingProvider,
} from '../ai/embedding-provider.js';
import {
  EmbeddingProviderError,
} from '../ai/embedding-errors.js';
import type {
  SemanticDocument,
} from '../intelligence/semantic-document.js';

export interface SemanticMemoryRecord {
  id: number;
  deviceId: string;
  trackId: string;
  trackHash: string | null;
  documentHash: string;
  embeddingModel: string;
  dimensions: number;
  similarity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticMemoryRepository {
  upsert(input: {
    deviceId: string;
    document: SemanticDocument;
    embeddingModel: string;
    embedding: number[];
  }): Promise<SemanticMemoryRecord>;

  search(input: {
    deviceId: string;
    embedding: number[];
    limit: number;
    minSimilarity: number;
  }): Promise<SemanticMemoryRecord[]>;
}

export interface SemanticMemoryService {
  embedTrack(input: {
    deviceId: string;
    document: SemanticDocument;
    model: string;
  }): Promise<SemanticMemoryRecord>;

  search(input: {
    deviceId: string;
    query: string;
    model: string;
    limit?: number;
    minSimilarity?: number;
  }): Promise<SemanticMemoryRecord[]>;
}

function validateEmbedding(
  embedding: number[],
  dimensions: number,
): void {
  if (
    embedding.length !== dimensions ||
    embedding.some(
      (value) =>
        typeof value !== 'number' ||
        !Number.isFinite(value),
    )
  ) {
    throw new EmbeddingProviderError(
      'invalid_response',
      `Embedding dimensions mismatch: expected ${dimensions}, received ${embedding.length}.`,
    );
  }
}

export function createSemanticMemoryService(options: {
  provider: AIEmbeddingProvider | null;
  repository: SemanticMemoryRepository;
}): SemanticMemoryService {
  return {
    async embedTrack({
      deviceId,
      document,
      model,
    }) {
      if (!options.provider) {
        throw new EmbeddingProviderError(
          'not_configured',
          'Embedding provider is not configured.',
        );
      }

      if (!deviceId.trim()) {
        throw new Error('Semantic memory device id is required.');
      }

      const response = await options.provider.embed({
        model,
        input: document.content,
      });

      if (response.embeddings.length !== 1) {
        throw new EmbeddingProviderError(
          'invalid_response',
          'Semantic memory requires exactly one embedding for a track document.',
        );
      }

      const embedding = response.embeddings[0] ?? [];
      validateEmbedding(
        embedding,
        options.provider.dimensions,
      );

      return options.repository.upsert({
        deviceId,
        document,
        embeddingModel: response.model,
        embedding,
      });
    },

    async search({
      deviceId,
      query,
      model,
      limit = 10,
      minSimilarity = 0,
    }) {
      if (!options.provider) {
        throw new EmbeddingProviderError(
          'not_configured',
          'Embedding provider is not configured.',
        );
      }

      if (!deviceId.trim()) {
        throw new Error('Semantic memory device id is required.');
      }

      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        throw new Error('Semantic memory search query is required.');
      }

      const response = await options.provider.embed({
        model,
        input: normalizedQuery,
      });

      if (response.embeddings.length !== 1) {
        throw new EmbeddingProviderError(
          'invalid_response',
          'Semantic memory search requires exactly one query embedding.',
        );
      }

      const embedding = response.embeddings[0] ?? [];
      validateEmbedding(
        embedding,
        options.provider.dimensions,
      );

      return options.repository.search({
        deviceId,
        embedding,
        limit: Math.max(1, Math.min(50, Math.trunc(limit))),
        minSimilarity: Math.max(
          -1,
          Math.min(1, minSimilarity),
        ),
      });
    },
  };
}
