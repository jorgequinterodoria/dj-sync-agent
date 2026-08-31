import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { DJTrack } from '../domain/dj-track.js';
import type { DJCue } from '../domain/dj-cue.js';
import type { DJPlaylist } from '../domain/dj-playlist.js';
import type { TrackQuery, TrackSearchResult, LibraryStats } from '../library/library-query.js';
import type { AudioAnalysis } from '../../audio/audio-analysis.js';
import type { VerifiedAudioAsset } from '../../audio/audio-verifier.js';
import type { AudioAnalysisPersistenceResult } from '../../audio/audio-analysis.js';
import type { TrackIntelligenceProfile } from '../../intelligence/intelligence-engine.js';
import type { AudioFeaturesV1, CopilotDbLocalStore, DJSessionInput, DJSessionSummary, DJSessionTrackInput, ExplicitPreferenceInput, ImplicitPreferenceEvidence, SyncRunStatus } from './ports.js';
import type { ConversationMemoryStore, ConversationSnapshot } from '../../ai/memory/conversation-memory-types.js';
import type { PersonalizedTrackProfile } from '../../personalization/personalization-types.js';
import { COPILOT_DB_SCHEMA_VERSION } from './schema.js';
import { COPILOT_DB_MIGRATIONS } from './migrations/0001_initial.js';
import { InMemoryCopilotDbStore } from './in-memory-store.js';
import { packConversationSnapshot, unpackConversationSnapshot } from './types.js';
import type { DJPreferenceDimension, DJPreferenceKind, DJBehaviorProfileV1 } from './types.js';

interface PersistedState {
  version: 1;
  savedAt: string;
  tracks: DJTrack[];
  playlists: DJPlaylist[];
  cues: Record<string, DJCue[]>;
  analyses: Array<{ trackId: string; analysis: AudioAnalysis; assetChecksum: string; assetPath: string | null; analysisRunId: number; createdAt: string }>;
  features: Array<{ trackId: string; features: AudioFeaturesV1 }>;
  intelligenceProfiles: Array<{
    args: {
      trackId: string;
      engineVersion: string;
      profileVersion: number;
      schemaVersion: number;
      audioFeaturesVersion: number;
      featuresVersion: number;
    };
    profile: TrackIntelligenceProfile;
  }>;
  syncRuns: Array<{ id: number; row: Awaited<ReturnType<InMemoryCopilotDbStore['getRun']>> }>;
  sessions: Array<{ summary: DJSessionSummary }>;
  transitions: Array<Awaited<ReturnType<InMemoryCopilotDbStore['getTransitionsFor']>>[number]>;
  feedback: Awaited<ReturnType<InMemoryCopilotDbStore['listRecommendationFeedback']>>;
  preferences: Array<{
    deviceId: string;
    dimension: DJPreferenceDimension;
    kind?: DJPreferenceKind;
    rows: Array<{ value: string; kind: DJPreferenceKind; totalWeight: number; lastOccurrence: string }>;
  }>;
  behaviorProfiles: Array<{
    args: { deviceId: string; profileVersion: number; schemaVersion: number; engineVersion: string };
    profile: DJBehaviorProfileV1;
  }>;
  conversations: ConversationSnapshot[];
}

const STATE_TABLE = 'copilot_store_state';
const META_TABLE = 'copilot_store_meta';

export interface SQLiteCopilotDbStoreOptions {
  readonly busyTimeoutMs?: number;
}

export class SQLiteCopilotDbStore extends InMemoryCopilotDbStore implements CopilotDbLocalStore {
  private readonly db: DatabaseSync;
  private closed = false;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly ready: Promise<void>;

  private readonly analysisRecords: PersistedState['analyses'] = [];
  private readonly intelligenceProfileArgs = new Map<string, PersistedState['intelligenceProfiles'][number]['args']>();
  private readonly syncRunIds = new Set<number>();
  private readonly preferenceQueries = new Set<string>();
  private readonly behaviorProfileArgs = new Map<string, PersistedState['behaviorProfiles'][number]['args']>();
  private readonly conversationIds = new Set<string>();

  public constructor(
    dbPath: string,
    options: SQLiteCopilotDbStoreOptions = {},
  ) {
    super();

    const absolutePath = resolve(dbPath);
    mkdirSync(dirname(absolutePath), { recursive: true, mode: 0o700 });

    this.db = new DatabaseSync(absolutePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.busyTimeoutMs ?? 5000))};`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS copilot_db_migrations (
        id TEXT NOT NULL PRIMARY KEY,
        version INTEGER NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
        id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        state_json TEXT NOT NULL
      ) STRICT;
    `);
    this.applyMigrations();
    this.db.exec(`PRAGMA user_version = ${COPILOT_DB_SCHEMA_VERSION};`);

    this.ready = this.restore();
  }

  public override async close(): Promise<void> {
    await this.ready;
    await this.writeChain;
    if (this.closed) return;
    await super.close();
    this.db.close();
    this.closed = true;
  }

  public async upsertTrack(track: DJTrack): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.upsertTrack(track);
    await this.persist();
  }

  public async upsertTracks(tracks: ReadonlyArray<DJTrack>): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.upsertTracks(tracks);
    await this.persist();
  }

  public async upsertPlaylist(playlist: DJPlaylist): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.upsertPlaylist(playlist);
    await this.persist();
  }

  public async upsertCues(trackId: string, cues: ReadonlyArray<DJCue>): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.upsertCues(trackId, cues);
    await this.persist();
  }

  public async persistAnalysis(trackId: string, analysis: AudioAnalysis, asset: VerifiedAudioAsset): Promise<AudioAnalysisPersistenceResult> {
    await this.ready;
    this.assertOpen();
    const result = await super.persistAnalysis(trackId, analysis, asset);
    this.analysisRecords.push({
      trackId,
      analysis,
      assetChecksum: asset.checksum,
      assetPath: asset.path,
      analysisRunId: result.analysisRunId,
      createdAt: new Date().toISOString(),
    });
    await this.persist();
    return result;
  }

  public async persistFeatures(trackId: string, features: AudioFeaturesV1): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.persistFeatures(trackId, features);
    await this.persist();
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
    await this.ready;
    this.assertOpen();
    await super.persistIntelligenceProfile(args);
    this.intelligenceProfileArgs.set(this.profileKey(args), {
      trackId: args.trackId,
      engineVersion: args.engineVersion,
      profileVersion: args.profileVersion,
      schemaVersion: args.schemaVersion,
      audioFeaturesVersion: args.audioFeaturesVersion,
      featuresVersion: args.featuresVersion,
    });
    await this.persist();
  }

  public async startRun(startedAt?: string): Promise<number> {
    await this.ready;
    this.assertOpen();
    const id = await super.startRun(startedAt);
    this.syncRunIds.add(id);
    await this.persist();
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
    await this.ready;
    this.assertOpen();
    await super.finishRun(args);
    this.syncRunIds.add(args.syncRunId);
    await this.persist();
  }

  public async upsertSession(session: DJSessionInput, now?: string): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.upsertSession(session, now);
    await this.persist();
  }

  public async endSession(sessionId: string, endedAt?: string): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.endSession(sessionId, endedAt);
    await this.persist();
  }

  public async appendSessionTrack(track: DJSessionTrackInput, now?: string): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.appendSessionTrack(track, now);
    await this.persist();
  }

  public async recordTransition(args: {
    trackAId: string;
    trackBId: string;
    durationPlayedAMs?: number | null;
    durationPlayedBMs?: number | null;
    successScore?: number;
    occurredAt?: string;
  }): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.recordTransition(args);
    await this.persist();
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
    await this.ready;
    this.assertOpen();
    await super.recordRecommendationFeedback(args, now);
    await this.persist();
  }

  public async recordExplicit(input: ExplicitPreferenceInput, now?: string): Promise<number> {
    await this.ready;
    this.assertOpen();
    const id = await super.recordExplicit(input, now);
    this.rememberPreferenceQueries(input.deviceId);
    await this.persist();
    return id;
  }

  public async recordImplicit(evidence: ImplicitPreferenceEvidence, now?: string): Promise<number> {
    await this.ready;
    this.assertOpen();
    const id = await super.recordImplicit(evidence, now);
    this.rememberPreferenceQueries(evidence.deviceId);
    await this.persist();
    return id;
  }

  public async removeExplicit(args: {
    deviceId: string;
    dimension: DJPreferenceDimension;
    value: string;
    kind: DJPreferenceKind;
  }): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.removeExplicit(args);
    this.rememberPreferenceQueries(args.deviceId);
    await this.persist();
  }

  public async persistBehaviorProfile(args: {
    deviceId: string;
    profileVersion: number;
    schemaVersion: number;
    engineVersion: string;
    profile: PersonalizedTrackProfile;
    computedAt?: string;
  }, now?: string): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.persistBehaviorProfile(args, now);
    this.behaviorProfileArgs.set(this.behaviorKey(args), {
      deviceId: args.deviceId,
      profileVersion: args.profileVersion,
      schemaVersion: args.schemaVersion,
      engineVersion: args.engineVersion,
    });
    await this.persist();
  }

  public async load(conversationId: string): Promise<ConversationSnapshot | null> {
    await this.ready;
    this.assertOpen();
    this.conversationIds.add(conversationId);
    return super.load(conversationId);
  }

  public async save(snapshot: ConversationSnapshot): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.save(snapshot);
    this.conversationIds.add(snapshot.conversationId);
    await this.persist();
  }

  public async delete(conversationId: string): Promise<void> {
    await this.ready;
    this.assertOpen();
    await super.delete(conversationId);
    this.conversationIds.add(conversationId);
    await this.persist();
  }

  public override asConversationMemoryStore(): ConversationMemoryStore {
    return {
      load: (id) => this.load(id),
      save: (snapshot) => this.save(snapshot),
      delete: (id) => this.delete(id),
    };
  }

  public override async getTrack(trackId: string): Promise<DJTrack | null> {
    await this.ready;
    this.assertOpen();
    return super.getTrack(trackId);
  }

  public override async listTrackIds(): Promise<string[]> {
    await this.ready;
    this.assertOpen();
    return super.listTrackIds();
  }

  public override async searchTracks(query: TrackQuery): Promise<TrackSearchResult> {
    await this.ready;
    this.assertOpen();
    return super.searchTracks(query);
  }

  public override async getLibraryStats(): Promise<LibraryStats> {
    await this.ready;
    this.assertOpen();
    return super.getLibraryStats();
  }

  public override async getPlaylist(playlistId: string): Promise<DJPlaylist | null> {
    await this.ready;
    this.assertOpen();
    return super.getPlaylist(playlistId);
  }

  public override async listPlaylists(): Promise<DJPlaylist[]> {
    await this.ready;
    this.assertOpen();
    return super.listPlaylists();
  }

  public override async getCues(trackId: string): Promise<DJCue[]> {
    await this.ready;
    this.assertOpen();
    return super.getCues(trackId);
  }

  public override async getLatestAnalysis(trackId: string): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['getLatestAnalysis']>>> {
    await this.ready;
    this.assertOpen();
    return super.getLatestAnalysis(trackId);
  }

  public override async getFeatures(trackId: string): Promise<AudioFeaturesV1 | null> {
    await this.ready;
    this.assertOpen();
    return super.getFeatures(trackId);
  }

  public override async getIntelligenceProfile(args: {
    trackId: string;
    engineVersion: string;
    profileVersion: number;
    schemaVersion: number;
    audioFeaturesVersion: number;
    featuresVersion: number;
  }): Promise<TrackIntelligenceProfile | null> {
    await this.ready;
    this.assertOpen();
    return super.getIntelligenceProfile(args);
  }

  public override async getLastSuccessfulRun(): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['getLastSuccessfulRun']>>> {
    await this.ready;
    this.assertOpen();
    return super.getLastSuccessfulRun();
  }

  public override async getRun(syncRunId: number): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['getRun']>>> {
    await this.ready;
    this.assertOpen();
    return super.getRun(syncRunId);
  }

  public override async getSession(sessionId: string): Promise<DJSessionSummary | null> {
    await this.ready;
    this.assertOpen();
    return super.getSession(sessionId);
  }

  public override async listSessions(limit?: number): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['listSessions']>>> {
    await this.ready;
    this.assertOpen();
    return super.listSessions(limit);
  }

  public override async getSessionTracks(sessionId: string): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['getSessionTracks']>>> {
    await this.ready;
    this.assertOpen();
    return super.getSessionTracks(sessionId);
  }

  public override async getTransitionsFor(trackAId: string): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['getTransitionsFor']>>> {
    await this.ready;
    this.assertOpen();
    return super.getTransitionsFor(trackAId);
  }

  public override async listRecommendationFeedback(args?: { sessionId?: string | null; acceptedOnly?: boolean; limit?: number }): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['listRecommendationFeedback']>>> {
    await this.ready;
    this.assertOpen();
    return super.listRecommendationFeedback(args);
  }

  public override async listValues(args: {
    deviceId: string;
    dimension: DJPreferenceDimension;
    kind?: DJPreferenceKind;
  }): Promise<Awaited<ReturnType<InMemoryCopilotDbStore['listValues']>>> {
    await this.ready;
    this.assertOpen();
    return super.listValues(args);
  }

  public override async isExcluded(args: {
    deviceId: string;
    dimension: DJPreferenceDimension;
    value: string;
  }): Promise<boolean> {
    await this.ready;
    this.assertOpen();
    return super.isExcluded(args);
  }

  public override async getBehaviorProfile(args: {
    deviceId: string;
    profileVersion: number;
    schemaVersion: number;
    engineVersion: string;
  }): Promise<DJBehaviorProfileV1 | null> {
    await this.ready;
    this.assertOpen();
    return super.getBehaviorProfile(args);
  }

  public override async getLatestBehaviorProfile(
    deviceId: string,
    args?: { schemaVersion?: number; engineVersion?: string },
  ): Promise<DJBehaviorProfileV1 | null> {
    await this.ready;
    this.assertOpen();
    return super.getLatestBehaviorProfile(deviceId, args);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('SQLite copilot store is closed.');
  }

  private applyMigrations(): void {
    const applied = new Set(
      (this.db.prepare('SELECT id FROM copilot_db_migrations ORDER BY version').all() as Array<{ id: string }>).map(
        (row) => row.id,
      ),
    );

    for (const migration of COPILOT_DB_MIGRATIONS) {
      if (applied.has(migration.id)) continue;

      const transaction = this.db.prepare('BEGIN');
      transaction.run();
      try {
        for (const statement of migration.up) {
          this.db.exec(statement);
        }
        this.db.prepare(
          'INSERT INTO copilot_db_migrations (id, version, applied_at) VALUES (?, ?, ?)',
        ).run(migration.id, migration.version, new Date().toISOString());
        this.db.prepare('COMMIT').run();
      } catch (error) {
        try {
          this.db.prepare('ROLLBACK').run();
        } catch {
          // Preserve the original migration error.
        }
        throw error;
      }
    }
  }

  private async restore(): Promise<void> {
    const row = this.db.prepare(
      `SELECT schema_version, state_json FROM ${STATE_TABLE} WHERE id = 1`,
    ).get() as { schema_version?: number; state_json?: string } | undefined;

    if (!row?.state_json) return;

    if (row.schema_version !== COPILOT_DB_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported copilot.db state schema version: ${String(row.schema_version)}`,
      );
    }

    const state = JSON.parse(row.state_json) as PersistedState;

    for (const track of state.tracks) await super.upsertTrack(track);
    for (const playlist of state.playlists) await super.upsertPlaylist(playlist);
    for (const [trackId, cues] of Object.entries(state.cues)) await super.upsertCues(trackId, cues);

    this.analysisRecords.push(...state.analyses);
    for (const record of state.analyses) {
      await super.persistAnalysis(
        record.trackId,
        record.analysis,
        { checksum: record.assetChecksum, path: record.assetPath } as VerifiedAudioAsset,
      );
    }

    for (const item of state.features) await super.persistFeatures(item.trackId, item.features);

    for (const item of state.intelligenceProfiles) {
      this.intelligenceProfileArgs.set(this.profileKey(item.args), item.args);
      await super.persistIntelligenceProfile({ ...item.args, profile: item.profile });
    }

    for (const item of state.syncRuns) {
      if (!item.row) continue;
      this.syncRunIds.add(item.id);
      const rowData = item.row;
      const id = await super.startRun(rowData.started_at);
      if (id !== item.id) {
        // The in-memory implementation allocates monotonically; preserve external IDs
        // only in SQLite state. Reads are restored with the same semantic payload.
      }
      if (rowData.status !== 'running') {
        await super.finishRun({
          syncRunId: id,
          status: rowData.status,
          rowsAdded: rowData.rows_added,
          rowsUpdated: rowData.rows_updated,
          rowsDeleted: rowData.rows_deleted,
          ...(rowData.error_message !== null ? { errorMessage: rowData.error_message } : {}),
          ...(rowData.finished_at !== null ? { finishedAt: rowData.finished_at } : {}),
        });
      }
    }

    for (const item of state.sessions) {
      await super.upsertSession({
        sessionId: item.summary.session.session_id,
        startedAt: item.summary.session.started_at,
        endedAt: item.summary.session.ended_at,
        source: item.summary.session.source,
        contextTag: item.summary.session.context_tag,
      });
      for (const track of item.summary.tracks) {
        await super.appendSessionTrack({
          sessionId: track.session_id,
          position: track.position,
          trackId: track.track_id,
          playedAt: track.played_at,
          source: track.source,
          durationPlayedMs: track.duration_played_ms,
          flags: JSON.parse(track.flags_json) as Record<string, unknown>,
        });
      }
      if (item.summary.session.ended_at) {
        await super.endSession(item.summary.session.session_id, item.summary.session.ended_at);
      }
    }

    for (const transition of state.transitions) {
      await super.recordTransition({
        trackAId: transition.track_a_id,
        trackBId: transition.track_b_id,
        durationPlayedAMs: transition.avg_duration_played_a_ms,
        durationPlayedBMs: transition.avg_duration_played_b_ms,
        successScore: transition.success_score,
        occurredAt: transition.last_seen_at,
      });
    }

    for (const feedback of state.feedback) {
      await super.recordRecommendationFeedback({
        feedbackId: feedback.rec_feedback_id,
        sessionId: feedback.session_id,
        trackId: feedback.track_id,
        accepted: feedback.accepted === 1,
        rankPosition: feedback.rank_position,
        clickedPreview: feedback.clicked_preview === 1,
        addedToSet: feedback.added_to_set === 1,
        occurredAt: feedback.occurred_at,
        contextTag: feedback.context_tag,
      }, feedback.created_at);
    }

    for (const query of state.preferences) {
      this.preferenceQueries.add(this.preferenceKey(query.deviceId, query.dimension, query.kind));
      for (const row of query.rows) {
        if (row.kind === 'derived') continue;
        await super.recordExplicit({
          deviceId: query.deviceId,
          dimension: query.dimension,
          value: row.value,
          kind: row.kind as Exclude<DJPreferenceKind, 'derived'>,
          weight: row.totalWeight,
          source: 'system',
          occurredAt: row.lastOccurrence,
        }, row.lastOccurrence);
      }
    }

    for (const item of state.behaviorProfiles) {
      this.behaviorProfileArgs.set(this.behaviorKey(item.args), item.args);
      await super.persistBehaviorProfile({ ...item.args, profile: item.profile });
    }

    for (const snapshot of state.conversations) {
      this.conversationIds.add(snapshot.conversationId);
      await super.save(snapshot);
    }
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const state = await this.capture();
      const now = new Date().toISOString();
      const transaction = this.db.prepare(
        `INSERT INTO ${STATE_TABLE} (id, schema_version, saved_at, state_json)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           schema_version = excluded.schema_version,
           saved_at = excluded.saved_at,
           state_json = excluded.state_json`,
      );
      transaction.run(COPILOT_DB_SCHEMA_VERSION, now, JSON.stringify(state));
      this.db.prepare(
        `INSERT INTO ${META_TABLE} (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(COPILOT_DB_SCHEMA_VERSION));
    });

    await this.writeChain;
  }

  private async capture(): Promise<PersistedState> {
    const tracks: DJTrack[] = [];
    for (const id of await super.listTrackIds()) {
      const track = await super.getTrack(id);
      if (track) tracks.push(track);
    }

    const playlists = await super.listPlaylists();
    const cues: Record<string, DJCue[]> = {};
    for (const id of await super.listTrackIds()) cues[id] = await super.getCues(id);

    const features: PersistedState['features'] = [];
    for (const id of await super.listTrackIds()) {
      const value = await super.getFeatures(id);
      if (value) features.push({ trackId: id, features: value });
    }

    const intelligenceProfiles: PersistedState['intelligenceProfiles'] = [];
    for (const args of this.intelligenceProfileArgs.values()) {
      const profile = await super.getIntelligenceProfile(args);
      if (profile) intelligenceProfiles.push({ args, profile });
    }

    const syncRuns: PersistedState['syncRuns'] = [];
    for (const id of this.syncRunIds) {
      syncRuns.push({ id, row: await super.getRun(id) });
    }

    const sessions: PersistedState['sessions'] = [];
    for (const session of await super.listSessions(10000)) {
      const summary = await super.getSession(session.session_id);
      if (summary) sessions.push({ summary });
    }

    const transitionsMap = new Map<string, PersistedState['transitions'][number]>();
    for (const trackId of await super.listTrackIds()) {
      for (const row of await super.getTransitionsFor(trackId)) {
        transitionsMap.set(`${row.track_a_id}|${row.track_b_id}`, row);
      }
    }

    const feedback = await super.listRecommendationFeedback({ limit: 100000 });

    const preferences: PersistedState['preferences'] = [];
    for (const key of this.preferenceQueries) {
      const [deviceId, dimension, rawKind] = key.split('\u0000') as [
        string,
        DJPreferenceDimension,
        DJPreferenceKind | '',
      ];
      const kind = rawKind || undefined;

      const rows = await super.listValues({
        deviceId,
        dimension,

        ...(kind !== undefined ? { kind } : {}),
      });
      preferences.push({ deviceId, dimension, ...(kind ? { kind } : {}), rows });
    }

    const behaviorProfiles: PersistedState['behaviorProfiles'] = [];
    for (const args of this.behaviorProfileArgs.values()) {
      const profile = await super.getBehaviorProfile(args);
      if (profile) behaviorProfiles.push({ args, profile });
    }

    const conversations: ConversationSnapshot[] = [];
    for (const id of this.conversationIds) {
      const snapshot = await super.load(id);
      if (snapshot) conversations.push(snapshot);
    }

    return {
      version: 1,
      savedAt: new Date().toISOString(),
      tracks,
      playlists,
      cues,
      analyses: [...this.analysisRecords],
      features,
      intelligenceProfiles,
      syncRuns,
      sessions,
      transitions: [...transitionsMap.values()],
      feedback,
      preferences,
      behaviorProfiles,
      conversations,
    };
  }

  private rememberPreferenceQueries(deviceId: string): void {
    const dimensions: readonly DJPreferenceDimension[] = [
      'genre', 'artist', 'label', 'key', 'bpm_range',
      'energy_range', 'track_exclusion', 'context_affinity',
    ];
    for (const dimension of dimensions) {
      this.preferenceQueries.add(this.preferenceKey(deviceId, dimension, undefined));
    }
  }

  private preferenceKey(deviceId: string, dimension: DJPreferenceDimension, kind?: DJPreferenceKind): string {
    return [deviceId, dimension, kind ?? ''].join('\u0000');
  }

  private profileKey(args: {
    trackId: string;
    engineVersion: string;
    profileVersion: number;
    schemaVersion: number;
    audioFeaturesVersion: number;
    featuresVersion: number;
  }): string {
    return [
      args.trackId,
      args.engineVersion,
      args.profileVersion,
      args.schemaVersion,
      args.audioFeaturesVersion,
      args.featuresVersion,
    ].join('\u0000');
  }

  private behaviorKey(args: {
    deviceId: string;
    profileVersion: number;
    schemaVersion: number;
    engineVersion: string;
  }): string {
    return [
      args.deviceId,
      args.profileVersion,
      args.schemaVersion,
      args.engineVersion,
    ].join('\u0000');
  }
}
