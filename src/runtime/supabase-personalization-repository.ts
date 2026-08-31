import type { LearningEvent, PersonalizedTrackProfile } from '../personalization/personalization-types.js';
import type { PersonalizationRepository } from './personalization-repository.js';

export interface SupabasePersonalizationRepositoryOptions {
  url: string;
  apiKey: string;
}

async function request<T>(url: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) throw new Error(`Supabase personalization request failed with HTTP ${response.status}.`);
  return (await response.json()) as T;
}

export class SupabasePersonalizationRepository implements PersonalizationRepository {
  private readonly url: string;
  private readonly apiKey: string;

  constructor(options: SupabasePersonalizationRepositoryOptions) {
    this.url = options.url.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    if (!this.url || !this.apiKey) throw new Error('Supabase personalization repository requires url and apiKey.');
  }

  async listEvents(deviceId: string, since?: string): Promise<LearningEvent[]> {
    const params = new URLSearchParams();
    params.set('device_id', `eq.${deviceId}`);
    params.set('order', 'occurred_at.asc,event_id.asc');
    if (since) params.set('occurred_at', `gte.${since}`);
    return request<LearningEvent[]>(`${this.url}/rest/v1/dj_learning_events?${params.toString()}`, this.apiKey);
  }

  async saveProfile(profile: PersonalizedTrackProfile): Promise<void> {
    await request(`${this.url}/rest/v1/dj_personalization_profiles`, this.apiKey, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        device_id: profile.deviceId,
        engine_version: profile.engineVersion,
        computed_at: profile.computedAt,
        profile: profile.profile,
        confidence: profile.confidence,
        evidence: profile.evidence,
      }),
    });
  }
}
