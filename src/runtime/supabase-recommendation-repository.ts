import type { RecommendationRepository } from './recommendation-repository.js';
import type { RecommendationResult, SetIntelligenceResult } from '../recommendations/recommendation-types.js';

export interface SupabaseRecommendationRepositoryOptions {
  url: string;
  apiKey: string;
  agentId: string;
  timeoutMs?: number;
}

export class SupabaseRecommendationRepository implements RecommendationRepository {
  private readonly url: URL;
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly timeoutMs: number;

  public constructor(options: SupabaseRecommendationRepositoryOptions) {
    if (!options.apiKey.trim()) throw new Error('SYNC_API_KEY is required.');
    if (!options.agentId.trim()) throw new Error('SYNC_AGENT_ID is required.');
    this.url = new URL(options.url);
    if (this.url.protocol !== 'http:' && this.url.protocol !== 'https:') {
      throw new Error(`Unsupported recommendations API protocol: ${this.url.protocol}`);
    }
    this.apiKey = options.apiKey;
    this.agentId = options.agentId;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  private async post(body: Record<string, unknown>): Promise<number> {
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
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error(`Recommendations API returned non-JSON response (HTTP ${response.status}).`); }
      if (!response.ok) {
        const detail = parsed && typeof parsed === 'object' && 'detail' in parsed ? String((parsed as { detail?: unknown }).detail) : raw.slice(0, 500);
        throw new Error(`Recommendations API rejected request: HTTP ${response.status}: ${detail}`);
      }
      const recordId = Number((parsed as { record?: { id?: unknown } }).record?.id);
      if (!Number.isSafeInteger(recordId) || recordId < 1) throw new Error('Recommendations API returned an invalid record id.');
      return recordId;
    } finally { clearTimeout(timeout); }
  }

  public saveRecommendation(input: { deviceId: string; currentTrackId: string; request: string; result: RecommendationResult }): Promise<number> {
    return this.post({ action: 'save_recommendation', ...input });
  }

  public saveSetIntelligence(input: { deviceId: string; request: string; result: SetIntelligenceResult }): Promise<number> {
    return this.post({ action: 'save_set_intelligence', ...input });
  }
}
