import { createHash } from 'node:crypto';

import type {
  SemanticDocument,
} from '../intelligence/semantic-document.js';

export type EmbeddingVectorV1 = Float32Array | number[];

export interface LocalSemanticIndexPort {
  upsert(documents: Array<{ document: SemanticDocument; embedding: EmbeddingVectorV1 }>): Promise<void>;
  search(query: EmbeddingVectorV1, limit?: number): Promise<Array<{ document: SemanticDocument; similarity: number }>>;
  remove(trackId: string): Promise<void>;
  size(): Promise<number>;
}

export interface SemanticEmbeddingProvider {
  readonly version: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<EmbeddingVectorV1[]>;
}

const HASH_DIMENSION = 32 as const;

export function normalizeTextForEmbedding(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toFloat32(vector: EmbeddingVectorV1): Float32Array {
  return vector instanceof Float32Array ? vector : new Float32Array(vector);
}

export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function norm(vector: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    const v = vector[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dotProduct(a, b) / (na * nb);
}

export function createOfflineHashEmbeddingProvider(
  dimension: number = HASH_DIMENSION,
): SemanticEmbeddingProvider {
  return {
    version: `offline-hash-v1-d${dimension}`,
    dimension,
    async embed(texts) {
      return texts.map((text) => {
        const normalized = normalizeTextForEmbedding(text);
        const tokens = normalized.split(/\s+/).filter(Boolean);
        const vector = new Float32Array(dimension);
        for (const token of tokens) {
          const h = createHash('sha256').update(token, 'utf8').digest();
          for (let i = 0; i < dimension; i++) {
            const byte = h[i % h.length] ?? 0;
            const sign = byte & 0b1000_0000 ? -1 : 1;
            const magnitude = (byte & 0b0111_1111) / 127;
            vector[i] = (vector[i] ?? 0) + sign * magnitude;
          }
        }
        const n = norm(vector);
        if (n > 0) for (let i = 0; i < dimension; i++) vector[i] = (vector[i] ?? 0) / n;
        return vector;
      });
    },
  };
}

export interface InMemorySemanticIndexOptions {
  similarityThreshold?: number | null;
}

export function createInMemorySemanticIndex(
  options: InMemorySemanticIndexOptions = {},
): LocalSemanticIndexPort {
  const items = new Map<string, { document: SemanticDocument; embedding: Float32Array }>();
  const threshold = options.similarityThreshold ?? 0.2;

  return {
    async upsert(documents) {
      for (const entry of documents) {
        const doc = entry.document;
        const embedding = toFloat32(entry.embedding);
        items.set(doc.trackId, { document: doc, embedding });
      }
    },
    async search(query, limit) {
      const q = toFloat32(query);
      const results: Array<{ document: SemanticDocument; similarity: number }> = [];
      for (const entry of items.values()) {
        const similarity = cosineSimilarity(q, entry.embedding);
        if (threshold != null && similarity < threshold) continue;
        results.push({ document: entry.document, similarity });
      }
      results.sort((a, b) => b.similarity - a.similarity || a.document.trackId.localeCompare(b.document.trackId));
      return results.slice(0, Math.max(1, Math.min(50, limit ?? 10)));
    },
    async remove(trackId) {
      items.delete(trackId);
    },
    async size() {
      return items.size;
    },
  };
}

export interface SemanticSearchResult {
  trackId: string;
  similarity: number;
  document: SemanticDocument;
}

export interface SemanticRetrievalV1Config {
  weightInTotalScore: number;
  enabled: boolean;
  offlineMode: boolean;
  similarityThreshold: number;
}

export const SEMANTIC_RETRIEVAL_V1_DEFAULTS: SemanticRetrievalV1Config = {
  weightInTotalScore: 0.15,
  enabled: true,
  offlineMode: true,
  similarityThreshold: 0.25,
};
