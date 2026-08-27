import { buildPersonalizedTrackProfile } from '../personalization/personalization-engine.js';
import type { LearningEvent, PersonalizedTrackProfile } from '../personalization/personalization-types.js';
import type { PersonalizationRepository } from './personalization-repository.js';

export interface DJSyncPersonalizationSnapshot {
  schemaVersion: 1;
  configured: boolean;
  status: 'disabled' | 'ready' | 'error';
  deviceId: string | null;
  computedAt: string | null;
  lastEventCount: number;
  lastError: string | null;
}

export interface DJSyncPersonalizationService {
  snapshot(): DJSyncPersonalizationSnapshot;
  learn(events: LearningEvent[], now?: string): PersonalizedTrackProfile;
  refresh(now?: string): Promise<PersonalizedTrackProfile>;
}

export function createDJSyncPersonalizationService(options: {
  deviceId: string;
  repository?: PersonalizationRepository;
}): DJSyncPersonalizationService {
  const deviceId = options.deviceId.trim();
  const configured = deviceId.length > 0 && options.repository !== undefined;

  let status: DJSyncPersonalizationSnapshot['status'] = configured ? 'ready' : 'disabled';
  let computedAt: string | null = null;
  let lastEventCount = 0;
  let lastError: string | null = null;

  return {
    snapshot() {
      return {
        schemaVersion: 1,
        configured,
        status,
        deviceId: deviceId || null,
        computedAt,
        lastEventCount,
        lastError,
      };
    },

    learn(events, now) {
      const profile = buildPersonalizedTrackProfile(deviceId, events, now);
      computedAt = profile.computedAt;
      lastEventCount = profile.evidence.totalEvents;
      lastError = null;
      status = 'ready';
      return profile;
    },

    async refresh(now) {
      if (!configured || options.repository === undefined) {
        status = 'disabled';
        throw new Error('Personalization is not configured.');
      }

      try {
        const events = await options.repository.listEvents(deviceId);
        const profile = buildPersonalizedTrackProfile(deviceId, events, now);
        await options.repository.saveProfile(profile);
        computedAt = profile.computedAt;
        lastEventCount = profile.evidence.totalEvents;
        lastError = null;
        status = 'ready';
        return profile;
      } catch (error) {
        status = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
  };
}
