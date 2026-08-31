import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { InMemoryCopilotDbStore } from './in-memory-store.js';
import type {
  DJSessionInput,
  DJSessionTrackInput,
  ExplicitPreferenceInput,
  ImplicitPreferenceEvidence,
} from './ports.js';
import type { DJSessionTrackRow } from './types.js';

interface PersistedJson {
  schemaVersion: number;
  savedAt: string;
  sessions: Array<{
    readonly row: DJSessionInput & {
    ended_at?: string | null;
    updated_at?: string;
  };
    readonly tracks: Array<
      Omit<DJSessionTrackInput, 'sessionId'> & { sessionId: string }
    >;
  }>;
  transitions: Array<{ key: string; row: unknown }>;
  feedbacks: Array<{ id: string; row: unknown }>;
  preferences: Array<{
    deviceId: string;
    dimension: string;
    value: string;
    kind: string;
    weight: number;
    source: string;
    occurredAt: string;
    createdAt: string;
  }>;
}

const COPILOT_STORE_FILE = 'copilot-store.json';

export class JsonFileCopilotDbStore extends InMemoryCopilotDbStore {
  private readonly filePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    private readonly baseDir: string,
  ) {
    super();
    this.filePath = `${baseDir.replace(/\/+$/, '')}/${COPILOT_STORE_FILE}`;
    this.ensureDir();
    this.loadFromDisk();
  }

  private ensureDir(): void {
    try {
      if (!existsSync(this.baseDir)) {
        mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
      }
      const dir = dirname(this.filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (error) {
      console.warn('[json-store] mkdir failed:', error);
    }
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const raw = readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as PersistedJson;
      if (parsed.schemaVersion !== this.schemaVersion) {
        console.warn(
          `[json-store] schema mismatch (disk=${parsed.schemaVersion}, current=${this.schemaVersion}): skipped load`,
        );
        return;
      }
      void this.replay(parsed);
    } catch (error) {
      console.warn('[json-store] load failed:', error);
    }
  }

  private async replay(snap: PersistedJson): Promise<void> {
    for (const s of snap.sessions) {
      const row = s.row;
      const input: DJSessionInput = {
        sessionId: row.sessionId,
        startedAt: row.startedAt,
        endedAt: row.endedAt ?? row.ended_at ?? null,
        source: row.source ?? 'manual',
        contextTag: row.contextTag ?? null,
      };
      await super.upsertSession(input);
      if (input.endedAt) {
        await super.endSession(input.sessionId, input.endedAt);
      }
      const sortedTracks = [...s.tracks].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      );
      for (const t of sortedTracks) {
        const sourceSafe: {
          sessionId: string;
          position: number;
          trackId: string;
          playedAt: string;
          source?: string | null;
          durationPlayedMs?: number | null;
          flags?: DJSessionTrackInput['flags'];
        } = {
          sessionId: t.sessionId,
          position: t.position,
          trackId: t.trackId,
          playedAt: t.playedAt,
        };
        if (t.source !== null && t.source !== undefined) {
          sourceSafe.source = t.source;
        }
        if (t.durationPlayedMs !== null && t.durationPlayedMs !== undefined) {
          sourceSafe.durationPlayedMs = t.durationPlayedMs;
        }
        if (t.flags !== undefined) {
          sourceSafe.flags = t.flags;
        }
        const track = sourceSafe as DJSessionTrackInput;
        await super.appendSessionTrack(track);
      }
    }
    for (const t of snap.transitions) {
      try {
        const row = t.row as Record<string, unknown> | null | undefined;
        if (!row) continue;
        const args: {
          trackAId: string;
          trackBId: string;
          durationPlayedAMs?: number | null;
          durationPlayedBMs?: number | null;
          successScore?: number;
          occurredAt?: string;
        } = {
          trackAId: String(row.track_a_id ?? row.trackAId ?? ''),
          trackBId: String(row.track_b_id ?? row.trackBId ?? ''),
        };
        if (typeof row.duration_played_a_ms === 'number') {
          args.durationPlayedAMs = row.duration_played_a_ms;
        }
        if (typeof row.duration_played_b_ms === 'number') {
          args.durationPlayedBMs = row.duration_played_b_ms;
        }
        if (typeof row.success_score === 'number') {
          args.successScore = row.success_score;
        }
        if (typeof row.occurred_at === 'string') {
          args.occurredAt = row.occurred_at;
        }
        await super.recordTransition(args);
      } catch {
        // skip malformed row
      }
    }
    for (const fb of snap.feedbacks) {
      try {
        const row = fb.row as Record<string, unknown> | null | undefined;
        if (!row) continue;
        const args: {
          feedbackId: string;
          sessionId?: string | null;
          trackId: string;
          accepted: boolean;
          rankPosition?: number | null;
          clickedPreview?: boolean;
          addedToSet?: boolean;
          occurredAt?: string;
          contextTag?: string | null;
        } = {
          feedbackId: String(row.feedbackId ?? fb.id),
          trackId: String(row.trackId ?? row.track_id ?? ''),
          accepted: Boolean(row.accepted),
        };
        if (row.sessionId !== undefined || row.session_id !== undefined) {
          const v = (row.sessionId ?? row.session_id) as string | null | undefined;
          args.sessionId = typeof v === 'string' ? v : null;
        }
        if (row.rankPosition !== undefined || row.rank_position !== undefined) {
          const v = (row.rankPosition ?? row.rank_position) as number | null | undefined;
          if (typeof v === 'number') args.rankPosition = v;
        }
        if (typeof row.clickedPreview === 'boolean') {
          args.clickedPreview = row.clickedPreview;
        } else if (typeof row.clicked_preview === 'boolean') {
          args.clickedPreview = row.clicked_preview;
        }
        if (typeof row.addedToSet === 'boolean') {
          args.addedToSet = row.addedToSet;
        } else if (typeof row.added_to_set === 'boolean') {
          args.addedToSet = row.added_to_set;
        }
        if (typeof row.occurredAt === 'string') {
          args.occurredAt = row.occurredAt;
        } else if (typeof row.occurred_at === 'string') {
          args.occurredAt = row.occurred_at;
        }
        if (row.contextTag !== undefined || row.context_tag !== undefined) {
          const v = (row.contextTag ?? row.context_tag) as string | null | undefined;
          args.contextTag = typeof v === 'string' ? v : null;
        }
        const createdAt =
          typeof row.createdAt === 'string'
            ? row.createdAt
            : typeof row.created_at === 'string'
              ? row.created_at
              : undefined;
        await super.recordRecommendationFeedback(args, createdAt);
      } catch {
        // skip malformed row
      }
    }
    for (const p of snap.preferences) {
      try {
        if (p.kind === 'derived') continue;
        const base: {
          deviceId: string;
          dimension: ExplicitPreferenceInput['dimension'];
          value: string;
          kind: ExplicitPreferenceInput['kind'];
          source?: 'system' | 'explicit';
          occurredAt: string;
          weight?: number;
        } = {
          deviceId: p.deviceId,
          dimension: p.dimension as ExplicitPreferenceInput['dimension'],
          value: p.value,
          kind: p.kind as ExplicitPreferenceInput['kind'],
          source: p.source === 'system' ? 'system' : 'explicit',
          occurredAt: p.occurredAt,
        };
        if (Number.isFinite(p.weight)) {
          base.weight = p.weight;
        }
        const input = base as ExplicitPreferenceInput;
        await super.recordExplicit(input, p.createdAt);
      } catch {
        // skip malformed row
      }
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer != null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveToDisk();
    }, 180);
  }

  private async saveToDisk(): Promise<void> {
    try {
      const sessions = await super.listSessions(10000);
      const hydratedSessions: PersistedJson['sessions'] = [];
      for (const rowSesh of sessions) {
        const tracks: DJSessionTrackRow[] = await super.getSessionTracks(
          rowSesh.session_id,
        );
        hydratedSessions.push({
          row: {
            sessionId: rowSesh.session_id,
            startedAt: rowSesh.started_at,
            endedAt: rowSesh.ended_at ?? null,
            source: rowSesh.source ?? 'manual',
            contextTag: rowSesh.context_tag ?? null,
          },
          tracks: tracks.map((r) => {
            const base: {
              sessionId: string;
              position: number;
              trackId: string;
              playedAt: string;
              source?: string | null;
              durationPlayedMs?: number | null;
            } = {
              sessionId: r.session_id,
              position: r.position,
              trackId: r.track_id,
              playedAt: r.played_at,
            };
            if (r.source !== null && r.source !== undefined) {
              base.source = r.source;
            }
            if (r.duration_played_ms !== null && r.duration_played_ms !== undefined) {
              base.durationPlayedMs = r.duration_played_ms;
            }
            return base as unknown as Omit<DJSessionTrackInput, 'sessionId'> & {
              sessionId: string;
            };
          }),
        });
      }
      const transitionRows: PersistedJson['transitions'] = [];
      for (const s of hydratedSessions) {
        for (let i = 0; i < Math.max(0, s.tracks.length - 1); i += 1) {
          const a = s.tracks[i]!;
          const b = s.tracks[i + 1]!;
          try {
            const found = await super.getTransitionsFor(a.trackId);
            for (const row of found) {
              if (
                (row.track_a_id === a.trackId && row.track_b_id === b.trackId) ||
                (row.track_a_id === b.trackId && row.track_b_id === a.trackId)
              ) {
                const key = `${row.track_a_id}|${row.track_b_id}`;
                if (!transitionRows.find((r) => r.key === key)) {
                  transitionRows.push({ key, row });
                }
              }
            }
          } catch {
            // skip
          }
        }
      }

      const feedbacks: PersistedJson['feedbacks'] = [];
      try {
        const rows = await super.listRecommendationFeedback({ limit: 5000 });
        for (const r of rows) {
          feedbacks.push({
            id: r.rec_feedback_id,
            row: r,
          });
        }
      } catch {
        // skip
      }

      const preferences: PersistedJson['preferences'] = [];
      try {
        const dims = [
          'genre', 'artist', 'label', 'key',
          'bpm_range', 'energy_range',
          'track_exclusion', 'context_affinity',
        ] as const;
        const kinds = [
          'preferred', 'avoided', 'excluded', 'min', 'max',
        ] as const;
        for (const dim of dims) {
          for (const k of kinds) {
            const rows = await super.listValues({
              deviceId: 'shell-default',
              dimension: dim,
              kind: k,
            });
            for (const r of rows) {
              preferences.push({
                deviceId: 'shell-default',
                dimension: dim,
                value: r.value,
                kind: r.kind,
                weight: Number.isFinite(r.totalWeight) ? r.totalWeight : 1,
                source: 'explicit',
                occurredAt: r.lastOccurrence,
                createdAt: r.lastOccurrence,
              });
            }
          }
        }
      } catch {
        // skip
      }

      const snap: PersistedJson = {
        schemaVersion: this.schemaVersion,
        savedAt: new Date().toISOString(),
        sessions: hydratedSessions,
        transitions: transitionRows,
        feedbacks,
        preferences,
      };
      this.ensureDir();
      writeFileSync(this.filePath, JSON.stringify(snap, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (error) {
      console.warn('[json-store] save failed:', error);
    }
  }

  public override async upsertSession(
    session: DJSessionInput,
    now?: string,
  ): Promise<void> {
    await super.upsertSession(session, now);
    this.scheduleSave();
  }

  public override async endSession(
    sessionId: string,
    endedAt?: string,
  ): Promise<void> {
    await super.endSession(sessionId, endedAt);
    this.scheduleSave();
  }

  public override async appendSessionTrack(
    track: DJSessionTrackInput,
    now?: string,
  ): Promise<void> {
    await super.appendSessionTrack(track, now);
    this.scheduleSave();
  }

  public override async recordTransition(
    args: {
      readonly trackAId: string;
      readonly trackBId: string;
      readonly durationPlayedAMs?: number | null;
      readonly durationPlayedBMs?: number | null;
      readonly successScore?: number;
      readonly occurredAt?: string;
    },
  ): Promise<void> {
    await super.recordTransition(args);
    this.scheduleSave();
  }

  public override async recordRecommendationFeedback(
    args: {
      readonly feedbackId: string;
      readonly sessionId?: string | null;
      readonly trackId: string;
      readonly accepted: boolean;
      readonly rankPosition?: number | null;
      readonly clickedPreview?: boolean;
      readonly addedToSet?: boolean;
      readonly occurredAt?: string;
      readonly contextTag?: string | null;
    },
    now?: string,
  ): Promise<void> {
    await super.recordRecommendationFeedback(args, now);
    this.scheduleSave();
  }

  public override async recordExplicit(
    input: ExplicitPreferenceInput,
    now?: string,
  ): Promise<number> {
    const res = await super.recordExplicit(input, now);
    this.scheduleSave();
    return res;
  }

  public override async recordImplicit(
    evidence: ImplicitPreferenceEvidence,
    now?: string,
  ): Promise<number> {
    const res = await super.recordImplicit(evidence, now);
    this.scheduleSave();
    return res;
  }

  public override async removeExplicit(
    args: {
      readonly deviceId: string;
      readonly dimension: ExplicitPreferenceInput['dimension'];
      readonly value: string;
      readonly kind: ExplicitPreferenceInput['kind'];
    },
  ): Promise<void> {
    await super.removeExplicit(args);
    this.scheduleSave();
  }

  public override async close(): Promise<void> {
    try {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        await this.saveToDisk();
      }
    } finally {
      await super.close();
    }
  }
}
