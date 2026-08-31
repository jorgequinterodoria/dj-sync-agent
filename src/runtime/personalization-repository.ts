import type { LearningEvent, PersonalizedTrackProfile } from '../personalization/personalization-types.js';

export interface PersonalizationRepository {
  listEvents(deviceId: string, since?: string): Promise<LearningEvent[]>;
  saveProfile(profile: PersonalizedTrackProfile): Promise<void>;
}
