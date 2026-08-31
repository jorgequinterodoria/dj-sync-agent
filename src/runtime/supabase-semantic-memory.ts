import type {
  SemanticDocument,
} from '../intelligence/semantic-document.js';
import type {
  SemanticMemoryRecord,
  SemanticMemoryRepository,
} from './semantic-memory.js';

interface HttpResponse {
  status: number;
  body: string;
}

export interface SupabaseSemanticMemoryRepositoryOptions {
  url: string;
  apiKey: string;
  agentId: string;
  timeoutMs?: number;
}

function parseRecord(value: unknown): SemanticMemoryRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid semantic memory record.');
  }

  const row = value as Record<string, unknown>;

  return {
    id: Number(row.id),
    deviceId: String(row.device_id),
    trackId: String(row.track_id),
    trackHash:
      typeof row.track_hash === 'string' ? row.track_hash : null,
    documentHash: String(row.document_hash),
    embeddingModel: String(row.embedding_model),
    dimensions: Number(row.dimensions),
    similarity:
      typeof row.similarity === 'number' ? row.similarity : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SupabaseSemanticMemoryRepository
  implements SemanticMemoryRepository
{
  private readonly url: URL;
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly timeoutMs: number;

  public constructor(options: SupabaseSemanticMemoryRepositoryOptions) {
    if (!options.apiKey.trim()) {
      throw new Error('SYNC_API_KEY is required.');
    }
    if (!options.agentId.trim()) {
      throw new Error('SYNC_AGENT_ID is required.');
    }

    this.url = new URL(options.url);
    if (
      this.url.protocol !== 'http:' &&
      this.url.protocol !== 'https:'
    ) {
      throw new Error(
        `Unsupported semantic memory API protocol: ${this.url.protocol}`,
      );
    }

    this.apiKey = options.apiKey;
    this.agentId = options.agentId;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  private async request(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const payload = JSON.stringify(body);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'x-api-key': this.apiKey,
          'x-agent-id': this.agentId,
          'content-type': 'application/json',
        },
        body: payload,
        signal: controller.signal,
      });

      const raw = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(
          `Semantic memory API returned non-JSON response (HTTP ${response.status}).`,
        );
      }

      if (!response.ok) {
        const detail =
          parsed && typeof parsed === 'object' && 'detail' in parsed
            ? String((parsed as { detail?: unknown }).detail)
            : raw.slice(0, 500);
        throw new Error(
          `Semantic memory API rejected request: HTTP ${response.status}: ${detail}`,
        );
      }

      return parsed as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async upsert(input: {
    deviceId: string;
    document: SemanticDocument;
    embeddingModel: string;
    embedding: number[];
  }): Promise<SemanticMemoryRecord> {
    const response = await this.request({
      action: 'upsert',
      trackId: input.document.trackId,
      trackHash: input.document.trackHash,
      documentHash: input.document.contentHash,
      document: input.document,
      embeddingModel: input.embeddingModel,
      embedding: input.embedding,
      metadata: input.document.metadata,
    });

    return parseRecord(response.record);
  }

  public async search(input: {
    deviceId: string;
    embedding: number[];
    limit: number;
    minSimilarity: number;
  }): Promise<SemanticMemoryRecord[]> {
    const response = await this.request({
      action: 'search',
      embedding: input.embedding,
      limit: input.limit,
      minSimilarity: input.minSimilarity,
    });

    return Array.isArray(response.records)
      ? response.records.map(parseRecord)
      : [];
  }
}
