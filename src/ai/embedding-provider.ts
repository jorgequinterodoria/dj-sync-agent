export interface EmbeddingRequest {
  input: string | string[];
  model: string;
}

export interface EmbeddingResponse {
  model: string;
  embeddings: number[][];
  usage: {
    inputTokens: number | null;
    totalTokens: number | null;
  };
}

export interface AIEmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
