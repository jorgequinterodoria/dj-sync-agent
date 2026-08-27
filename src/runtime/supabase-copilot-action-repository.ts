import type {
  CopilotAction,
  CopilotActionResult,
  CopilotActionRunRecord,
} from '../actions/action-types.js';

export interface CopilotActionRepository {
  save(input: {
    deviceId: string;
    trackId: string;
    request: string;
    action: CopilotAction;
    result: CopilotActionResult;
  }): Promise<CopilotActionRunRecord>;
}

export interface SupabaseCopilotActionRepositoryOptions {
  url: string;
  apiKey: string;
  agentId: string;
  timeoutMs?: number;
}

function parseRecord(value: unknown): CopilotActionRunRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid copilot action run record.');
  }

  const row = value as Record<string, unknown>;
  return {
    id: Number(row.id),
    deviceId: String(row.device_id),
    trackId: String(row.track_id),
    actionId: String(row.action_id),
    actionType: String(row.action_type) as CopilotActionRunRecord['actionType'],
    risk: String(row.risk) as CopilotActionRunRecord['risk'],
    approved: Boolean(row.approved),
    request: String(row.request),
    input:
      row.input && typeof row.input === 'object'
        ? (row.input as Record<string, unknown>)
        : {},
    result: row.result as CopilotActionResult,
    createdAt: String(row.created_at),
  };
}

export class SupabaseCopilotActionRepository implements CopilotActionRepository {
  private readonly url: URL;
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly timeoutMs: number;

  public constructor(options: SupabaseCopilotActionRepositoryOptions) {
    if (!options.apiKey.trim()) {
      throw new Error('SYNC_API_KEY is required.');
    }
    if (!options.agentId.trim()) {
      throw new Error('SYNC_AGENT_ID is required.');
    }

    this.url = new URL(options.url);
    if (this.url.protocol !== 'http:' && this.url.protocol !== 'https:') {
      throw new Error(
        `Unsupported copilot actions API protocol: ${this.url.protocol}`,
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
    action: CopilotAction;
    result: CopilotActionResult;
  }): Promise<CopilotActionRunRecord> {
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
          copilotAction: input.action,
          result: input.result,
          approved:
            !input.action.requiresApproval || input.result.status !== 'rejected',
        }),
        signal: controller.signal,
      });

      const raw = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(
          `Copilot actions API returned non-JSON response (HTTP ${response.status}).`,
        );
      }

      if (!response.ok) {
        const detail =
          parsed && typeof parsed === 'object' && 'detail' in parsed
            ? String((parsed as { detail?: unknown }).detail)
            : raw.slice(0, 500);
        throw new Error(
          `Copilot actions API rejected request: HTTP ${response.status}: ${detail}`,
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
