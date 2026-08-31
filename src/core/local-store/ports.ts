import type { DJTrack } from '../domain/dj-track.js';
import type { DJCue } from '../domain/dj-cue.js';
import type { DJPlaylist } from '../domain/dj-playlist.js';
import type {
  TrackQuery,
  TrackSearchResult,
  LibraryStats,
} from '../library/library-query.js';
import type { AudioAnalysis } from '../../audio/audio-analysis.js';
import type { VerifiedAudioAsset } from '../../audio/audio-verifier.js';
import type { AudioAnalysisPersistenceResult } from '../../audio/audio-analysis.js';
import type { TrackIntelligenceProfile } from '../../intelligence/intelligence-engine.js';
import type { SyncRunRow } from './types.js';
import type {
  DJSessionRow,
  DJSessionTrackRow,
  DJTransitionRow,
  RecommendationFeedbackRow,
  DJPreferenceKind,
  DJPreferenceDimension,
  DJPreferenceRow,
  DJBehaviorProfileV1,
  DJSessionTrackFlags,
} from './types.js';
import type {
  ConversationMemoryStore,
  ConversationSnapshot,
} from '../../ai/memory/conversation-memory-types.js';
import type { PersonalizedTrackProfile } from '../../personalization/personalization-types.js';

export type {
  DJPreferenceDimension,
  DJPreferenceKind,
  DJPreferenceRow,
  DJSessionRow,
  DJSessionTrackRow,
  DJSessionTrackFlags,
  DJTransitionRow,
  RecommendationFeedbackRow,
};

export interface LocalReadModelStorePort {
  readonly schemaVersion: number;

  close(): Promise<void>;

  upsertTrack(track: DJTrack): Promise<void>;
  upsertTracks(tracks: ReadonlyArray<DJTrack>): Promise<void>;
  getTrack(trackId: string): Promise<DJTrack | null>;
  listTrackIds(): Promise<string[]>;
  searchTracks(query: TrackQuery): Promise<TrackSearchResult>;
  getLibraryStats(): Promise<LibraryStats>;

  upsertPlaylist(playlist: DJPlaylist): Promise<void>;
  getPlaylist(playlistId: string): Promise<DJPlaylist | null>;
  listPlaylists(): Promise<DJPlaylist[]>;

  upsertCues(trackId: string, cues: ReadonlyArray<DJCue>): Promise<void>;
  getCues(trackId: string): Promise<DJCue[]>;
}

export interface LocalAudioAnalysisStorePort {
  persistAnalysis(
    trackId: string,
    analysis: AudioAnalysis,
    asset: VerifiedAudioAsset,
  ): Promise<AudioAnalysisPersistenceResult>;

  getLatestAnalysis(
    trackId: string,
  ): Promise<{ analysis: AudioAnalysis; assetChecksum: string; assetPath: string | null; analysisRunId: number } | null>;
}

export type MusicalSectionType =
  | 'intro'
  | 'outro'
  | 'breakdown'
  | 'drop'
  | 'peak'
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'unknown';

export interface MusicalSectionV1 {
  type: MusicalSectionType;
  startMs: number;
  endMs: number;
  bpmEvidence: number | null;
  energyFloor01: number | null;
}

export type AudioFeaturesV1 = {
  schemaVersion: 1;
  generatedAt: string;
  analyzerVersion: string;
  trackId: string;
  energy: number | null;
  danceability: number | null;
  danceFloorIntensity: number | null;
  rhythmicDensity: number | null;
  moodTags: string[];
  vocalPresence: number | null;
  instrumentalProbability: number | null;
  musicalSections: MusicalSectionV1[] | null;
  phraseBoundariesMs: number[] | null;
  qualityFlags: string[];
};

export type TrackAudioFeaturesV1 = AudioFeaturesV1;

export interface LocalAudioFeaturesStorePort {
  persistFeatures(
    trackId: string,
    features: AudioFeaturesV1,
  ): Promise<void>;

  getFeatures(
    trackId: string,
  ): Promise<AudioFeaturesV1 | null>;
}

export interface LocalIntelligenceProfileStorePort {
  persistIntelligenceProfile(args: {
    trackId: string;
    engineVersion: string;
    profileVersion: number;
    schemaVersion: number;
    audioFeaturesVersion: number;
    featuresVersion: number;
    profile: TrackIntelligenceProfile;
  }): Promise<void>;

  getIntelligenceProfile(args: {
    trackId: string;
    engineVersion: string;
    profileVersion: number;
    schemaVersion: number;
    audioFeaturesVersion: number;
    featuresVersion: number;
  }): Promise<TrackIntelligenceProfile | null>;
}

export type SyncRunStatus = 'running' | 'success' | 'error';

export interface LocalSyncRunStorePort {
  startRun(startedAt?: string): Promise<number>;
  finishRun(args: {
    syncRunId: number;
    status: SyncRunStatus;
    rowsAdded: number;
    rowsUpdated: number;
    rowsDeleted: number;
    errorMessage?: string;
    finishedAt?: string;
  }): Promise<void>;
  getLastSuccessfulRun(): Promise<SyncRunRow | null>;
  getRun(syncRunId: number): Promise<SyncRunRow | null>;
}

export interface DJSessionInput {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly endedAt?: string | null;
  readonly source: 'live' | 'rekordbox_export' | 'manual' | 'simulation' | string;
  readonly contextTag?: string | null;
}

export interface DJSessionTrackInput {
  readonly sessionId: string;
  readonly position: number;
  readonly trackId: string;
  readonly playedAt: string;
  readonly source?: string | null;
  readonly durationPlayedMs?: number | null;
  readonly flags?: DJSessionTrackFlags;
}

export interface DJSessionSummary {
  readonly session: DJSessionRow;
  readonly tracks: readonly DJSessionTrackRow[];
  readonly transitionCount: number;
}

export interface LocalDJHistoryStorePort {
  upsertSession(session: DJSessionInput, now?: string): Promise<void>;
  endSession(sessionId: string, endedAt?: string): Promise<void>;
  getSession(sessionId: string): Promise<DJSessionSummary | null>;
  listSessions(limit?: number): Promise<DJSessionRow[]>;

  appendSessionTrack(track: DJSessionTrackInput, now?: string): Promise<void>;
  getSessionTracks(sessionId: string): Promise<DJSessionTrackRow[]>;

  recordTransition(args: {
    trackAId: string;
    trackBId: string;
    durationPlayedAMs?: number | null;
    durationPlayedBMs?: number | null;
    successScore?: number;
    occurredAt?: string;
  }): Promise<void>;
  getTransitionsFor(trackAId: string): Promise<DJTransitionRow[]>;

  recordRecommendationFeedback(args: {
    feedbackId: string;
    sessionId?: string | null;
    trackId: string;
    accepted: boolean;
    rankPosition?: number | null;
    clickedPreview?: boolean;
    addedToSet?: boolean;
    occurredAt?: string;
    contextTag?: string | null;
  }, now?: string): Promise<void>;
  listRecommendationFeedback(args?: { sessionId?: string | null; acceptedOnly?: boolean; limit?: number }): Promise<RecommendationFeedbackRow[]>;
}

export interface ExplicitPreferenceInput {
  readonly deviceId: string;
  readonly dimension: DJPreferenceDimension;
  readonly value: string;
  readonly kind: Exclude<DJPreferenceKind, 'derived'>;
  readonly weight?: number;
  readonly source?: 'explicit' | 'system';
  readonly occurredAt?: string;
}

export interface ImplicitPreferenceEvidence {
  readonly deviceId: string;
  readonly dimension: DJPreferenceDimension;
  readonly value: string;
  readonly positive: boolean;
  readonly weight?: number;
  readonly occurredAt?: string;
}

export interface LocalDJPreferenceStorePort {
  recordExplicit(input: ExplicitPreferenceInput, now?: string): Promise<number>;
  recordImplicit(evidence: ImplicitPreferenceEvidence, now?: string): Promise<number>;
  listValues(args: {
    deviceId: string;
    dimension: DJPreferenceDimension;
    kind?: DJPreferenceKind;
  }): Promise<Array<{ value: string; kind: DJPreferenceKind; totalWeight: number; lastOccurrence: string }>>;
  isExcluded(args: { deviceId: string; dimension: DJPreferenceDimension; value: string }): Promise<boolean>;
  removeExplicit(args: {
    deviceId: string;
    dimension: DJPreferenceDimension;
    value: string;
    kind: DJPreferenceKind;
  }): Promise<void>;
}

export interface LocalDJBehaviorProfileStorePort {
  persistBehaviorProfile(args: {
    deviceId: string;
    profileVersion: number;
    schemaVersion: number;
    engineVersion: string;
    profile: PersonalizedTrackProfile;
    computedAt?: string;
  }, now?: string): Promise<void>;

  getBehaviorProfile(args: {
    deviceId: string;
    profileVersion: number;
    schemaVersion: number;
    engineVersion: string;
  }): Promise<DJBehaviorProfileV1 | null>;

  getLatestBehaviorProfile(deviceId: string, args?: { schemaVersion?: number; engineVersion?: string }): Promise<DJBehaviorProfileV1 | null>;
}

export interface LocalConversationStorePort extends ConversationMemoryStore {}

export interface CopilotDbLocalStore
  extends LocalReadModelStorePort,
    LocalAudioAnalysisStorePort,
    LocalAudioFeaturesStorePort,
    LocalIntelligenceProfileStorePort,
    LocalSyncRunStorePort,
    LocalDJHistoryStorePort,
    LocalDJPreferenceStorePort,
    LocalDJBehaviorProfileStorePort,
    LocalConversationStorePort {
  asConversationMemoryStore(): ConversationMemoryStore;
}

export type { ConversationSnapshot, ConversationMemoryStore };
