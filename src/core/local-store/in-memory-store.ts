import type { DJTrack } from '../domain/dj-track.js';
import type { DJCue } from '../domain/dj-cue.js';
import type { DJPlaylist } from '../domain/dj-playlist.js';
import type {
  LibraryStats,
  TrackQuery,
  TrackSearchResult,
} from '../library/library-query.js';
import type { AudioAnalysis } from '../../audio/audio-analysis.js';
import type { VerifiedAudioAsset } from '../../audio/audio-verifier.js';
import type { AudioAnalysisPersistenceResult } from '../../audio/audio-analysis.js';
import type { TrackIntelligenceProfile } from '../../intelligence/intelligence-engine.js';
import type {
  AudioFeaturesV1,
  CopilotDbLocalStore,
  DJSessionInput,
  DJSessionSummary,
  DJSessionTrackInput,
  ExplicitPreferenceInput,
  ImplicitPreferenceEvidence,
  SyncRunStatus,
} from './ports.js';
import type { ConversationMemoryStore, ConversationSnapshot } from '../../ai/memory/conversation-memory-types.js';
import { COPILOT_DB_SCHEMA_VERSION, COPILOT_DB_TABLES, renderAllSchemaSql } from './schema.js';
import {
  mergeDJTransitionRow,
  normalizePreferenceValue,
  toCueRows,
  toDJBehaviorProfileRow,
  toDJCuesFromRows,
  toDJPlaylistFromRow,
  toDJPreferenceRowExplicit,
  toDJPreferenceRowImplicit,
  toDJSessionRow,
  toDJSessionTrackRow,
  toDJTrackFromRow,
  toDJTransitionRowInitial,
  toNormalizedTrackRow,
  toPlaylistRows,
  toRecommendationFeedbackRow,
  unpackDJBehaviorProfile,
  isoNow,
} from './codec.js';
import {
  packConversationSnapshot,
  unpackConversationSnapshot,
} from './types.js';
import type {
  AudioAnalysisResultRow,
  AudioFeaturesRow,
  CopilotConversationRow,
  CueRow,
  DJBehaviorProfileRow,
  DJPreferenceDimension,
  DJPreferenceKind,
  DJPreferenceRow,
  DJSessionRow,
  DJSessionTrackRow,
  DJTrackProfileRow,
  DJTransitionRow,
  NormalizedTrackRow,
  PlaylistEntryRow,
  PlaylistRow,
  RecommendationFeedbackRow,
  SyncRunRow,
} from './types.js';
import type { PersonalizedTrackProfile } from '../../personalization/personalization-types.js';

type NormalizedTrackMap = Map<string, NormalizedTrackRow>;
type PlaylistMap = Map<string, { row: PlaylistRow; entries: PlaylistEntryRow[] }>;
type CueMap = Map<string, CueRow[]>;
type AnalysisMap = Map<string, AudioAnalysisResultRow[]>;
type FeaturesMap = Map<string, AudioFeaturesRow>;
type ProfileKey = string;
type ProfileMap = Map<ProfileKey, DJTrackProfileRow>;

type SessionMap = Map<string, { row: DJSessionRow; tracks: Map<number, DJSessionTrackRow>; trackCount: number }>;
type TransitionKey = string;
type TransitionMap = Map<TransitionKey, DJTransitionRow>;
type FeedbackMap = Map<string, RecommendationFeedbackRow>;
type PreferenceList = DJPreferenceRow[];
type BehaviorProfileMap = Map<string, DJBehaviorProfileRow>;
type ConversationMap = Map<string, CopilotConversationRow>;

const TRACK_PLACEHOLDER_ID = 'PLACEHOLDER_FOR_TRACK_EXISTENCE';

export class InMemoryCopilotDbStore implements CopilotDbLocalStore {
  public readonly schemaVersion = COPILOT_DB_SCHEMA_VERSION;

  private nextSyncRunId = 1;
  private nextAnalysisRunId = 1;
  private nextPreferenceId = 1;
  private readonly normalizedTracks: NormalizedTrackMap = new Map();
  private readonly playlists: PlaylistMap = new Map();
  private readonly cues: CueMap = new Map();
  private readonly audioAnalysis: AnalysisMap = new Map();
  private readonly audioFeatures: FeaturesMap = new Map();
  private readonly profiles: ProfileMap = new Map();
  private readonly syncRuns: SyncRunRow[] = [];

  private readonly sessions: SessionMap = new Map();
  private readonly transitions: TransitionMap = new Map();
  private readonly feedbacks: FeedbackMap = new Map();
  private readonly preferences: PreferenceList = [];
  private readonly behaviorProfiles: BehaviorProfileMap = new Map();
  private readonly conversations: ConversationMap = new Map();

  public constructor() {
    this.applySchema();
  }

  public async close(): Promise<void> {
    this.normalizedTracks.clear();
    this.playlists.clear();
    this.cues.clear();
    this.audioAnalysis.clear();
    this.audioFeatures.clear();
    this.profiles.clear();
    this.syncRuns.length = 0;

    this.sessions.clear();
    this.transitions.clear();
    this.feedbacks.clear();
    this.preferences.length = 0;
    this.behaviorProfiles.clear();
    this.conversations.clear();
  }

  public static buildSchemaStatements(): string[] {
    return renderAllSchemaSql();
  }

  public asConversationMemoryStore(): ConversationMemoryStore {
    return {
      load: (id) => this.load(id),
      save: (snapshot) => this.save(snapshot),
      delete: (id) => this.delete(id),
    };
  }

  public async upsertTrack(track: DJTrack): Promise<void> {
    this.upsertTrackInternal(track);
  }

  public async upsertTracks(tracks: ReadonlyArray<DJTrack>): Promise<void> {
    for (const track of tracks) this.upsertTrackInternal(track);
  }

  public async getTrack(trackId: string): Promise<DJTrack | null> {
    const row = this.normalizedTracks.get(trackId);
    return row ? toDJTrackFromRow(row) : null;
  }

  public async listTrackIds(): Promise<string[]> {
    return [...this.normalizedTracks.keys()].sort();
  }

  public async searchTracks(query: TrackQuery): Promise<TrackSearchResult> {
    const tracks: DJTrack[] = [...this.normalizedTracks.values()].map(toDJTrackFromRow);
    const filtered = tracks.filter((track) => matchesQuery(track, query));
    const sorted = filtered.sort(compareTracks);
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    return {
      items: sorted.slice(offset, offset + limit),
      total: sorted.length,
      limit,
      offset,
    };
  }

  public async getLibraryStats(): Promise<LibraryStats> {
    const tracks = [...this.normalizedTracks.values()].map(toDJTrackFromRow);
    let bpmSum = 0;
    let bpmCount = 0;
    let tracksWithLocalFile = 0;
    let analyzedTracks = 0;
    let ratedTracks = 0;

    for (const track of tracks) {
      const bpm = track.technical.bpm;
      if (typeof bpm === 'number' && Number.isFinite(bpm)) {
        bpmSum += bpm;
        bpmCount += 1;
      }
      if (track.primaryFile.localPath) tracksWithLocalFile += 1;
      if (track.technical.analyzed !== null && track.technical.analyzed > 0) analyzedTracks += 1;
      if (track.technical.rating !== null && Number.isFinite(track.technical.rating)) ratedTracks += 1;
    }

    return {
      trackCount: tracks.length,
      tracksWithLocalFile,
      analyzedTracks,
      averageBpm: bpmCount === 0 ? null : bpmSum / bpmCount,
      ratedTracks,
    };
  }

  public async upsertPlaylist(playlist: DJPlaylist): Promise<void> {
    const { row, entries } = toPlaylistRows(playlist);
    const existing = this.playlists.get(playlist.id);
    let mergedRow = row;
    if (existing) {
      mergedRow = { ...existing.row, ...row, track_count: entries.length, updated_at: row.updated_at ?? existing.row.updated_at };
    }
    this.playlists.set(playlist.id, { row: mergedRow, entries });
  }

  public async getPlaylist(playlistId: string): Promise<DJPlaylist | null> {
    const entry = this.playlists.get(playlistId);
    return entry ? toDJPlaylistFromRow(entry.row, entry.entries) : null;
  }

  public async listPlaylists(): Promise<DJPlaylist[]> {
    return [...this.playlists.values()].map(({ row, entries }) => toDJPlaylistFromRow(row, entries));
  }

  public async upsertCues(trackId: string, cues: ReadonlyArray<DJCue>): Promise<void> {
    this.cues.set(trackId, toCueRows(trackId, cues));
  }

  public async getCues(trackId: string): Promise<DJCue[]> {
    const rows = this.cues.get(trackId) ?? [];
    return toDJCuesFromRows(rows);
  }

  public async persistAnalysis(
    trackId: string, analysis: AudioAnalysis, asset: VerifiedAudioAsset): Promise<AudioAnalysisPersistenceResult> {
    const analysisRunId = this.nextAnalysisRunId;
    this.nextAnalysisRunId += 1;
    const row: AudioAnalysisResultRow = {
      analysis_run_id: analysisRunId,
      track_id: trackId,
      asset_checksum: asset.checksum,
      asset_path: asset.path,
      duration_seconds: analysis.durationSeconds,
      sample_rate: analysis.sampleRate,
      channels: analysis.channels,
      bitrate: analysis.bitrate,
      codec: analysis.codec,
      created_at: new Date().toISOString(),
    };
    const arr = this.audioAnalysis.get(trackId) ?? [];
    arr.push(row);
    this.audioAnalysis.set(trackId, arr);
    return { analysisRunId, persistedFeatures: countDefinedAnalysisFields(analysis) };
  }

  public async getLatestAnalysis(trackId: string): Promise<{
    analysis: AudioAnalysis;
    assetChecksum: string;
    assetPath: string | null;
    analysisRunId: number;
  } | null> {
    const arr = this.audioAnalysis.get(trackId) ?? [];
    if (arr.length === 0) return null;
    const latest = arr[arr.length - 1]!;
    return {
      analysisRunId: latest.analysis_run_id,
      assetChecksum: latest.asset_checksum,
      assetPath: latest.asset_path,
      analysis: {
        durationSeconds: latest.duration_seconds,
        sampleRate: latest.sample_rate,
        channels: latest.channels,
        bitrate: latest.bitrate,
        codec: latest.codec,
      },
    };
  }

  public async persistFeatures(trackId: string, features: AudioFeaturesV1): Promise<void> {
    const row: AudioFeaturesRow = {
      track_id: trackId,
      schema_version: features.schemaVersion,
      analyzer_version: features.analyzerVersion,
      generated_at: features.generatedAt,
      feature_json: JSON.stringify(features),
      updated_at: new Date().toISOString(),
    };
    this.audioFeatures.set(trackId, row);
  }

  public async getFeatures(trackId: string): Promise<AudioFeaturesV1 | null> {
    const row = this.audioFeatures.get(trackId);
    return row ? (JSON.parse(row.feature_json) as AudioFeaturesV1) : null;
  }

  public async persistIntelligenceProfile(args: {
    trackId: string;
    engineVersion: string;
    profileVersion: number;
    schemaVersion: number;
    audioFeaturesVersion: number;
    featuresVersion: number;
    profile: TrackIntelligenceProfile;
  }): Promise<void> {
    const key = profileKey(args);
    const row: DJTrackProfileRow = {
      track_id: args.trackId,
      engine_version: args.engineVersion,
      profile_version: args.profileVersion,
      schema_version: args.schemaVersion,
      audio_features_version: args.audioFeaturesVersion,
      features_version: args.featuresVersion,
      computed_at: args.profile.computedAt,
      profile_json: JSON.stringify(args.profile),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.profiles.set(key, row);
  }

  public async getIntelligenceProfile(args: {
    trackId: string;
    engineVersion: string;
    profileVersion: number;
    schemaVersion: number;
    audioFeaturesVersion: number;
    featuresVersion: number;
  }): Promise<TrackIntelligenceProfile | null> {
    const row = this.profiles.get(profileKey(args));
    return row ? (JSON.parse(row.profile_json) as TrackIntelligenceProfile) : null;
  }

  public async startRun(startedAt?: string): Promise<number> {
    const id = this.nextSyncRunId;
    this.nextSyncRunId += 1;
    const run: SyncRunRow = {
      sync_run_id: id,
      started_at: startedAt ?? new Date().toISOString(),
      finished_at: null,
      status: 'running',
      rows_added: 0,
      rows_updated: 0,
      rows_deleted: 0,
      error_message: null,
    };
    this.syncRuns.push(run);
    return id;
  }

  public async finishRun(args: {
    syncRunId: number;
    status: SyncRunStatus;
    rowsAdded: number;
    rowsUpdated: number;
    rowsDeleted: number;
    errorMessage?: string;
    finishedAt?: string;
  }): Promise<void> {
    const run = this.syncRuns.find((r) => r.sync_run_id === args.syncRunId);
    if (!run) throw new Error(`Sync run ${args.syncRunId} not found`);
    run.finished_at = args.finishedAt ?? new Date().toISOString();
    run.status = args.status;
    run.rows_added = args.rowsAdded;
    run.rows_updated = args.rowsUpdated;
    run.rows_deleted = args.rowsDeleted;
    run.error_message = args.errorMessage ?? null;
  }

  public async getLastSuccessfulRun(): Promise<SyncRunRow | null> {
    for (let i = this.syncRuns.length - 1; i >= 0; i -= 1) {
      const run = this.syncRuns[i]!;
      if (run.status === 'success') return run;
    }
    return null;
  }

  public async getRun(syncRunId: number): Promise<SyncRunRow | null> {
    return this.syncRuns.find((r) => r.sync_run_id === syncRunId) ?? null;
  }

  public async upsertSession(session: DJSessionInput, now?: string): Promise<void> {
    const row = toDJSessionRow(session, now);
    const existing = this.sessions.get(session.sessionId);
    if (existing) {
      existing.row = { ...existing.row, ...row, created_at: existing.row.created_at, updated_at: row.updated_at };
    } else {
      this.sessions.set(session.sessionId, { row, tracks: new Map(), trackCount: 0 });
    }
  }

  public async endSession(sessionId: string, endedAt?: string): Promise<void> {
    const bucket = this.sessions.get(sessionId);
    if (!bucket) return;
    const when = endedAt ?? new Date().toISOString();
    bucket.row.ended_at = when;
    bucket.row.updated_at = when;
  }

  public async getSession(sessionId: string): Promise<DJSessionSummary | null> {
    const bucket = this.sessions.get(sessionId);
    if (!bucket) return null;
    const tracks = [...bucket.tracks.values()].sort((a, b) => a.position - b.position);
    let transitionCount = 0;
    for (let i = 0; i < Math.max(0, tracks.length - 1); i += 1) {
      const a = tracks[i]!;
      const b = tracks[i + 1]!;
      const key = transitionKey(a.track_id, b.track_id);
      if (this.transitions.has(key)) transitionCount += 1;
    }
    return { session: bucket.row, tracks, transitionCount };
  }

  public async listSessions(limit = 50): Promise<DJSessionRow[]> {
    return [...this.sessions.values()]
      .map((b) => b.row)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, Math.max(0, limit));
  }

  public async appendSessionTrack(track: DJSessionTrackInput, now?: string): Promise<void> {
    const bucket = this.sessions.get(track.sessionId);
    if (!bucket) throw new Error(`Session ${track.sessionId} not found. Call upsertSession first.`);
    const row = toDJSessionTrackRow(track, now);
    bucket.tracks.set(row.position, row);
    bucket.row.updated_at = row.created_at;
  }

  public async getSessionTracks(sessionId: string): Promise<DJSessionTrackRow[]> {
    const bucket = this.sessions.get(sessionId);
    if (!bucket) return [];
    return [...bucket.tracks.values()].sort((a, b) => a.position - b.position);
  }

  public async recordTransition(args: {
    trackAId: string;
    trackBId: string;
    durationPlayedAMs?: number | null;
    durationPlayedBMs?: number | null;
    successScore?: number;
    occurredAt?: string;
  }): Promise<void> {
    this.ensureTrackPlaceholders(args.trackAId, args.trackBId);
    const key = transitionKey(args.trackAId, args.trackBId);
    const existing = this.transitions.get(key);
    if (existing) {
      this.transitions.set(key, mergeDJTransitionRow(existing, args));
    } else {
      this.transitions.set(key, toDJTransitionRowInitial(args));
    }
  }

  public async getTransitionsFor(trackAId: string): Promise<DJTransitionRow[]> {
    const rows: DJTransitionRow[] = [];
    for (const [key, row] of this.transitions.entries()) {
      if (key.startsWith(`${trackAId}__`)) rows.push(row);
    }
    return rows.sort((a, b) => (b.success_score - a.success_score) || (b.frequency - a.frequency) || a.track_b_id.localeCompare(b.track_b_id));
  }

  public async recordRecommendationFeedback(args: {
    feedbackId: string;
    sessionId?: string | null;
    trackId: string;
    accepted: boolean;
    rankPosition?: number | null;
    clickedPreview?: boolean;
    addedToSet?: boolean;
    occurredAt?: string;
    contextTag?: string | null;
  }, now?: string): Promise<void> {
    this.ensureTrackPlaceholders(args.trackId);
    const row = now !== undefined
      ? toRecommendationFeedbackRow({ ...args, now })
      : toRecommendationFeedbackRow(args);
    this.feedbacks.set(args.feedbackId, row);
  }

  public async listRecommendationFeedback(args: { sessionId?: string | null; acceptedOnly?: boolean; limit?: number } = {}): Promise<RecommendationFeedbackRow[]> {
    const rows = [...this.feedbacks.values()].filter((row) => {
      if (args.sessionId !== undefined && row.session_id !== (args.sessionId ?? null)) return false;
      if (args.acceptedOnly && row.accepted !== 1) return false;
      return true;
    });
    rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.rec_feedback_id.localeCompare(b.rec_feedback_id));
    const limit = typeof args.limit === 'number' ? Math.max(0, args.limit) : rows.length;
    return rows.slice(0, limit);
  }

  public async recordExplicit(input: ExplicitPreferenceInput, now?: string): Promise<number> {
    const pref = toDJPreferenceRowExplicit(input, now);
    const row: DJPreferenceRow = {
      preference_id: this.nextPreferenceId,
      created_at: isoNow(now),
      ...pref,
    };
    this.nextPreferenceId += 1;
    this.preferences.push(row);
    return row.preference_id;
  }

  public async recordImplicit(evidence: ImplicitPreferenceEvidence, now?: string): Promise<number> {
    const pref = toDJPreferenceRowImplicit(evidence, now);
    const row: DJPreferenceRow = {
      preference_id: this.nextPreferenceId,
      created_at: isoNow(now),
      ...pref,
    };
    this.nextPreferenceId += 1;
    this.preferences.push(row);
    return row.preference_id;
  }

  public async listValues(args: {
    deviceId: string;
    dimension: DJPreferenceDimension;
    kind?: DJPreferenceKind;
  }): Promise<Array<{ value: string; kind: DJPreferenceKind; totalWeight: number; lastOccurrence: string }>> {
    const deviceId = args.deviceId.trim();
    const map = new Map<string, { kind: DJPreferenceKind; totalWeight: number; lastOccurrence: string }>();
    for (const row of this.preferences) {
      if (row.device_id !== deviceId) continue;
      if (row.dimension !== args.dimension) continue;
      if (args.kind !== undefined && row.kind !== args.kind) continue;
      const existing = map.get(row.value);
      if (existing) {
        existing.totalWeight += row.weight;
        if (row.occurred_at > existing.lastOccurrence) existing.lastOccurrence = row.occurred_at;
      } else {
        map.set(row.value, { kind: row.kind, totalWeight: row.weight, lastOccurrence: row.occurred_at });
      }
    }
    return [...map.entries()]
      .map(([value, rest]) => ({ value, ...rest }))
      .sort((a, b) => (b.totalWeight - a.totalWeight) || b.lastOccurrence.localeCompare(a.lastOccurrence) || a.value.localeCompare(b.value));
  }

  public async isExcluded(args: { deviceId: string; dimension: DJPreferenceDimension; value: string }): Promise<boolean> {
    const deviceId = args.deviceId.trim();
    const normalized = normalizePreferenceValue(args.value, args.dimension);
    for (let i = this.preferences.length - 1; i >= 0; i -= 1) {
      const row = this.preferences[i]!;
      if (row.device_id !== deviceId) continue;
      if (row.dimension !== args.dimension) continue;
      if (row.value !== normalized) continue;
      if (row.kind === 'excluded') return true;
      if (row.kind === 'preferred' || row.kind === 'avoided') return false;
    }
    return false;
  }

  public async removeExplicit(args: {
    deviceId: string;
    dimension: DJPreferenceDimension;
    value: string;
    kind: DJPreferenceKind;
  }): Promise<void> {
    const deviceId = args.deviceId.trim();
    const normalized = normalizePreferenceValue(args.value, args.dimension);
    for (let i = this.preferences.length - 1; i >= 0; i -= 1) {
      const row = this.preferences[i]!;
      if (
        row.device_id === deviceId &&
        row.dimension === args.dimension &&
        row.value === normalized &&
        row.kind === args.kind &&
        (row.source === 'explicit' || row.source === 'system')
      ) {
        this.preferences.splice(i, 1);
      }
    }
  }

  public async persistBehaviorProfile(argsPersist: {
    deviceId: string;
    profileVersion: number;
    schemaVersion: number;
    engineVersion: string;
    profile: PersonalizedTrackProfile;
    computedAt?: string;
  }, now?: string): Promise<void> {
    const key = behaviorKey(argsPersist.deviceId, argsPersist.profileVersion, argsPersist.schemaVersion, argsPersist.engineVersion);
    const row = now !== undefined
      ? toDJBehaviorProfileRow({ ...argsPersist, now })
      : toDJBehaviorProfileRow(argsPersist);
    const existing = this.behaviorProfiles.get(key);
    if (existing) {
      row.created_at = existing.created_at;
    }
    this.behaviorProfiles.set(key, row);
  }

  public async getBehaviorProfile(args: {
    deviceId: string;
    profileVersion: number;
    schemaVersion: number;
    engineVersion: string;
  }): Promise<PersonalizedTrackProfile | null> {
    const key = behaviorKey(args.deviceId, args.profileVersion, args.schemaVersion, args.engineVersion);
    const row = this.behaviorProfiles.get(key);
    return row ? unpackDJBehaviorProfile(row) : null;
  }

  private async getTrackProfile(args: {
    trackId: string;
    engineVersion: string;
    profileVersion: number;
    schemaVersion: number;
    audioFeaturesVersion: number;
    featuresVersion: number;
  }): Promise<TrackIntelligenceProfile | null> {
    const row = this.profiles.get(profileKey(args));
    return row ? (JSON.parse(row.profile_json) as TrackIntelligenceProfile) : null;
  }

  public async getLatestBehaviorProfile(deviceId: string, args: { schemaVersion?: number; engineVersion?: string } = {}): Promise<PersonalizedTrackProfile | null> {
    const schemaVersion = args.schemaVersion ?? 1;
    const engineVersion = args.engineVersion ?? '1.0.0';
    const candidates: { key: string; row: DJBehaviorProfileRow }[] = [];
    for (const [key, row] of this.behaviorProfiles.entries()) {
      if (row.device_id !== deviceId.trim()) continue;
      if (row.schema_version !== schemaVersion) continue;
      if (row.engine_version !== engineVersion) continue;
      candidates.push({ key, row });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.row.profile_version - a.row.profile_version || b.row.updated_at.localeCompare(a.row.updated_at));
    return unpackDJBehaviorProfile(candidates[0]!.row);
  }

  public async load(conversationId: string): Promise<ConversationSnapshot | null> {
    const row = this.conversations.get(conversationId);
    return row ? unpackConversationSnapshot(row) : null;
  }

  public async save(snapshot: ConversationSnapshot): Promise<void> {
    const existing = this.conversations.get(snapshot.conversationId);
    const base = packConversationSnapshot(snapshot);
    const ts = isoNow();
    const row: CopilotConversationRow = {
      ...base,
      created_at: existing?.created_at ?? snapshot.createdAt ?? ts,
      updated_at: snapshot.updatedAt ?? ts,
    };
    this.conversations.set(snapshot.conversationId, row);
  }

  public async delete(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
  }

  private applySchema(): void {
    void COPILOT_DB_TABLES;
  }

  private upsertTrackInternal(track: DJTrack): void {
    const existing = this.normalizedTracks.get(track.identity.id);
    const row = toNormalizedTrackRow(track);
    if (existing) {
      row.created_at = existing.created_at;
    }
    this.normalizedTracks.set(track.identity.id, row);
  }

  private ensureTrackPlaceholders(...trackIds: string[]): void {
    for (const id of trackIds) {
      if (!this.normalizedTracks.has(id) && id !== TRACK_PLACEHOLDER_ID) {
        // Strict adapter requires FK. Tests using InMemory don't always upsert tracks first —
        // allow any string without throwing. SQLite real driver will enforce FK at write.
        void TRACK_PLACEHOLDER_ID;
      }
    }
  }
}

function countDefinedAnalysisFields(analysis: AudioAnalysis): number {
  let count = 0;
  if (analysis.bitrate != null) count += 1;
  if (analysis.channels != null) count += 1;
  if (analysis.codec != null) count += 1;
  if (analysis.durationSeconds != null) count += 1;
  if (analysis.sampleRate != null) count += 1;
  return count;
}

function profileKey(args: {
  trackId: string;
  engineVersion: string;
  profileVersion: number;
  schemaVersion: number;
  audioFeaturesVersion: number;
  featuresVersion: number;
}): ProfileKey {
  return [
    args.trackId,
    args.engineVersion,
    String(args.profileVersion),
    String(args.schemaVersion),
    String(args.audioFeaturesVersion),
    String(args.featuresVersion),
  ].join('::');
}

function behaviorKey(deviceId: string, profileVersion: number, schemaVersion: number, engineVersion: string): string {
  return [deviceId.trim(), String(profileVersion), String(schemaVersion), engineVersion].join('::');
}

function transitionKey(a: string, b: string): TransitionKey {
  return `${a}__${b}`;
}

function matchesQuery(track: DJTrack, query: TrackQuery): boolean {
  if (query.bpmMin !== undefined && !matchesMin(track.technical.bpm, query.bpmMin)) return false;
  if (query.bpmMax !== undefined && !matchesMax(track.technical.bpm, query.bpmMax)) return false;
  if (query.ratingMin !== undefined && !matchesMin(track.technical.rating, query.ratingMin)) return false;
  if (query.playCountMax !== undefined && !matchesMax(track.technical.playCount, query.playCountMax)) return false;
  if (query.genre !== undefined && !containsNormalized(track.metadata.genre, query.genre)) return false;
  if (query.key !== undefined && !containsNormalized(track.metadata.key, query.key)) return false;
  if (query.label !== undefined && !containsNormalized(track.metadata.label, query.label)) return false;
  if (query.artist !== undefined && !containsNormalized(track.metadata.artist, query.artist)) return false;
  if (query.playlistId !== undefined && !track.playlists.some((playlist) => playlist.playlistId === query.playlistId)) return false;
  if (query.hasLocalFile !== undefined && Boolean(track.primaryFile.localPath) !== query.hasLocalFile) return false;
  if (query.text !== undefined && !matchesText(track, query.text)) return false;
  return true;
}

function matchesMin(value: number | null, minimum: number): boolean {
  return value !== null && value >= minimum;
}

function matchesMax(value: number | null, maximum: number): boolean {
  return value !== null && value <= maximum;
}

function containsNormalized(value: string | null, expected: string): boolean {
  return value !== null && normalize(value).includes(normalize(expected));
}

function matchesText(track: DJTrack, value: string): boolean {
  const needle = normalize(value);
  if (!needle) return true;
  const haystack = [
    track.metadata.title,
    track.metadata.artist,
    track.metadata.album,
    track.metadata.genre,
    track.metadata.label,
    track.metadata.key,
    track.metadata.remixer,
    track.metadata.composer,
    track.metadata.isrc,
    ...track.playlists.map((playlist) => playlist.playlistName),
  ]
    .filter((item): item is string => Boolean(item))
    .map(normalize)
    .join(' ');
  return haystack.includes(needle);
}

function compareTracks(a: DJTrack, b: DJTrack): number {
  return getTrackDisplayName(a).localeCompare(getTrackDisplayName(b), undefined, { sensitivity: 'base' }) ||
    a.identity.id.localeCompare(b.identity.id);
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Track query limit must be a positive integer.');
  }
  return Math.min(value, 1000);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Track query offset must be a non-negative integer.');
  }
  return value;
}

function normalize(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase();
}

function getTrackDisplayName(track: DJTrack): string {
  const parts = [track.metadata.artist, track.metadata.title].filter(Boolean) as string[];
  return parts.join(' - ') || track.identity.id;
}
