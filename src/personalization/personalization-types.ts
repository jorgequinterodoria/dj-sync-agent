export interface PreferenceSignals {
  preferredGenres: string[];
  avoidedGenres: string[];
  preferredBpmMin: number | null;
  preferredBpmMax: number | null;
  preferredEnergyMin: number | null;
  preferredEnergyMax: number | null;
  preferredKeys: string[];
  preferredArtists: string[];
  avoidedArtists: string[];
}

export interface LearningEvent {
  eventId: string;
  deviceId: string;
  eventType:
    | 'track_played'
    | 'track_skipped'
    | 'recommendation_accepted'
    | 'recommendation_rejected'
    | 'track_rated'
    | 'set_track_selected';
  trackId: string;
  occurredAt: string;
  bpm?: number | null;
  energy?: number | null;
  genre?: string | null;
  key?: string | null;
  artist?: string | null;
  rating?: number | null;
  context?: Record<string, unknown>;
}

export interface PersonalizedTrackProfile {
  schemaVersion: 1;
  engineVersion: string;
  computedAt: string;
  deviceId: string;
  profile: PreferenceSignals;
  confidence: {
    genre: number;
    bpm: number;
    energy: number;
    key: number;
    artist: number;
  };
  evidence: {
    totalEvents: number;
    positiveEvents: number;
    negativeEvents: number;
  };
}

export interface PersonalizationSnapshot {
  schemaVersion: 1;
  engineVersion: string;
  computedAt: string;
  deviceId: string;
  profile: PersonalizedTrackProfile;
}
