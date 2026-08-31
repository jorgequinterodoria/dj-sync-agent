import type {
  DJReasoningResult,
  DJReasoningRunRecord,
} from '../reasoning/reasoning-types.js';

export interface SupabaseReasoningRepositoryOptions {
  url: string;
  apiKey: string;
  agentId: string;
  timeoutMs?: number;
}

export interface DJReasoningRepository {
  save(input: {
    deviceId: string;
    trackId: string;
    request: string;
    result: DJReasoningResult;
  }): Promise<DJReasoningRunRecord>;
}

function parseRecord(value: unknown): DJReasoningRunRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid reasoning run record.');
  }

  const row = value as Record<string, unknown>;
  if (!row.result || typeof row.result !== 'object') {
    throw new Error('Invalid reasoning result record.');
  }

  return {
    id: Number(row.id),
    deviceId: String(row.device_id),
    trackId: String(row.track_id),
    reasoningId: String(row.reasoning_id),
    engineVersion: String(row.engine_version),
    model: String(row.model),
    provider: String(row.provider),
    request: String(row.request),
    result: row.result as DJReasoningResult,
    createdAt: String(row.created_at),
  };
}

export class SupabaseReasoningRepository implements DJReasoningRepository {
  private readonly url: URL;
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly timeoutMs: number;

  public constructor(options: SupabaseReasoningRepositoryOptions) {
    if (!options.apiKey.trim()) {
      throw new Error('SYNC_API_KEY is required.');
    }
    if (!options.agentId.trim()) {
      throw new Error('SYNC_AGENT_ID is required.');
    }

    this.url = new URL(options.url);
    if (this.url.protocol !== 'http:' && this.url.protocol !== 'https:') {
      throw new Error(
        `Unsupported reasoning API protocol: ${this.url.protocol}`,
      );
    }

    this.apiKey = options.apiKey;
    this.agentId = options.agentId;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  public async save(input: {
    deviceId: string;
    trackId: string;
    request: string;
    result: DJReasoningResult;
  }): Promise<DJReasoningRunRecord> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'x-api-key': this.apiKey,
          'x-agent-id': this.agentId,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save',
          deviceId: input.deviceId,
          trackId: input.trackId,
          request: input.request,
          result: input.result,
        }),
        signal: controller.signal,
      });

      const raw = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(
          `Reasoning API returned non-JSON response (HTTP ${response.status}).`,
        );
      }

      if (!response.ok) {
        const detail =
          parsed && typeof parsed === 'object' && 'detail' in parsed
            ? String((parsed as { detail?: unknown }).detail)
            : raw.slice(0, 500);
        throw new Error(
          `Reasoning API rejected request: HTTP ${response.status}: ${detail}`,
        );
      }

      return parseRecord(
        (parsed as Record<string, unknown>).record,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
