import type { EmbeddingVectorV1, SemanticEmbeddingProvider } from './semantic-retrieval-v1.js';

export interface HttpEmbeddingProviderOptions {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly dimension?: number;
  readonly fetchImpl?: typeof fetch;
}

interface EmbeddingsResponse {
  readonly data?: readonly { readonly embedding?: readonly number[]; readonly index?: number }[];
}

export function createHttpSemanticEmbeddingProvider(
  options: HttpEmbeddingProviderOptions,
): SemanticEmbeddingProvider {
  const endpoint = options.endpoint.trim().replace(/\/$/, '');
  if (!/^https:\/\//u.test(endpoint)) throw new Error('Embedding endpoint must use HTTPS.');
  if (!options.apiKey.trim()) throw new Error('Embedding API key is required.');
  if (!options.model.trim()) throw new Error('Embedding model is required.');
  const fetchImpl = options.fetchImpl ?? fetch;
  const dimension = options.dimension ?? 0;

  return {
    version: `http-embeddings-v2:${options.model}`,
    dimension,
    async embed(texts: string[]): Promise<EmbeddingVectorV1[]> {
      if (texts.length === 0) return [];
      const response = await fetchImpl(`${endpoint}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: options.model, input: texts }),
      });
      if (!response.ok) throw new Error(`Embedding provider request failed: HTTP ${response.status}`);
      const payload = (await response.json()) as EmbeddingsResponse;
      if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
        throw new Error('Embedding provider returned an invalid vector count.');
      }
      const ordered = [...payload.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectors = ordered.map((item) => {
        if (!Array.isArray(item.embedding) || item.embedding.length === 0 || item.embedding.some((v:unknown) => !Number.isFinite(v as number))) {
          throw new Error('Embedding provider returned an invalid vector.');
        }
        if (dimension > 0 && item.embedding.length !== dimension) {
          throw new Error(`Embedding dimension mismatch: expected ${dimension}, got ${item.embedding.length}.`);
        }
        return [...item.embedding];
      });
      return vectors;
    },
  };
}
