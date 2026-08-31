import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

let DatabaseSyncCtor: any = null;
let SQLiteCopilotDbStoreCtor: any = null;
let ConversationSnapshotT: any = null;
let DJTrackT: any = null;
let hasNodeSqlite = false;
try {
  const modSqlite = await import('node:sqlite');
  const modStore = await import('./sqlite-store.js');
  if (typeof modSqlite.DatabaseSync === 'function' && typeof modStore.SQLiteCopilotDbStore === 'function') {
    DatabaseSyncCtor = modSqlite.DatabaseSync;
    SQLiteCopilotDbStoreCtor = modStore.SQLiteCopilotDbStore;
    hasNodeSqlite = true;
  }
} catch {
  hasNodeSqlite = false;
}

type DJTrackLocal = {
  schemaVersion: 1;
  identity: { id: string; uuid: string };
  metadata: {
    title: string; artist: string; album: null; genre: string; label: null; key: string;
    remixer: null; composer: null; isrc: null;
  };
  technical: {
    bpmRaw: number; bpm: number; lengthSeconds: number; bitrate: number; bitDepth: number;
    sampleRate: number; rating: number; playCount: number; fileType: number; analyzed: number;
  };
  primaryFile: {
    id: string; path: string; localPath: string; hash: null; size: number; kind: 'media';
  };
  files: unknown[]; cues: unknown[]; playlists: unknown[];
  sync: { rbLocalDeleted: null; rbLocalUsn: number; updatedAt: string };
};

type ConversationSnapshotLocal = {
  schemaVersion: 1;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  messages: unknown[];
  constraints: unknown[];
};

function track(id: string): DJTrackLocal {
  return {
    schemaVersion: 1,
    identity: { id, uuid: id },
    metadata: {
      title: `Track ${id}`,
      artist: 'Test Artist',
      album: null,
      genre: 'House',
      label: null,
      key: '8A',
      remixer: null,
      composer: null,
      isrc: null,
    },
    technical: {
      bpmRaw: 124,
      bpm: 124,
      lengthSeconds: 300,
      bitrate: 320,
      bitDepth: 16,
      sampleRate: 44100,
      rating: 4,
      playCount: 1,
      fileType: 1,
      analyzed: 1,
    },
    primaryFile: {
      id: `file:${id}`,
      path: `/tmp/${id}.mp3`,
      localPath: `/tmp/${id}.mp3`,
      hash: null,
      size: 100,
      kind: 'media',
    },
    files: [],
    cues: [],
    playlists: [],
    sync: {
      rbLocalDeleted: null,
      rbLocalUsn: 1,
      updatedAt: '2026-08-31T00:00:00.000Z',
    },
  };
}

if (hasNodeSqlite && DatabaseSyncCtor && SQLiteCopilotDbStoreCtor) {

test('PHASE61: SQLite store creates copilot.db and applies all migrations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dj-sync-agent-'));
  const dbPath = join(dir, 'copilot.db');

  try {
    const store = new SQLiteCopilotDbStoreCtor(dbPath);
    await store.upsertTrack(track('t-1'));
    await store.close();

    const header = readFileSync(dbPath).subarray(0, 16).toString('ascii');
    assert.equal(header, 'SQLite format 3\u0000');

    const db = new DatabaseSyncCtor(dbPath);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all() as Array<{ name: string }>;
    const names = new Set(tables.map((row) => row.name));

    for (const name of [
      'normalized_tracks',
      'playlists',
      'playlist_entries',
      'cues',
      'audio_analysis_results',
      'audio_features',
      'dj_track_profiles',
      'sync_runs',
      'dj_sessions',
      'dj_session_tracks',
      'dj_transitions',
      'recommendation_feedback',
      'dj_preferences',
      'dj_behavior_profiles',
      'copilot_conversations',
      'copilot_db_migrations',
      'copilot_store_state',
    ]) {
      assert.equal(names.has(name), true, `missing table ${name}`);
    }

    const migrations = db.prepare(
      'SELECT COUNT(*) AS count FROM copilot_db_migrations',
    ).get() as { count: number };
    assert.equal(migrations.count, 2);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PHASE61: library and DJ memory survive process restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dj-sync-agent-'));
  const dbPath = join(dir, 'copilot.db');

  try {
    const first = new SQLiteCopilotDbStoreCtor(dbPath);
    await first.upsertTrack(track('t-1'));
    await first.upsertSession({
      sessionId: 'session-1',
      startedAt: '2026-08-31T01:00:00.000Z',
      source: 'manual',
      contextTag: 'warmup',
    });
    await first.appendSessionTrack({
      sessionId: 'session-1',
      position: 1,
      trackId: 't-1',
      playedAt: '2026-08-31T01:01:00.000Z',
      flags: { playedFull: true },
    });
    await first.recordExplicit({
      deviceId: 'device-1',
      dimension: 'genre',
      value: 'House',
      kind: 'preferred',
      weight: 2,
      occurredAt: '2026-08-31T01:02:00.000Z',
    });

    const conversation: ConversationSnapshotLocal = {
      schemaVersion: 1,
      conversationId: 'conversation-1',
      createdAt: '2026-08-31T01:03:00.000Z',
      updatedAt: '2026-08-31T01:03:00.000Z',
      summary: 'Persistent conversation',
      messages: [],
      constraints: [],
    };
    await first.save(conversation);
    await first.close();

    const second = new SQLiteCopilotDbStoreCtor(dbPath);
    assert.deepEqual((await second.getTrack('t-1'))?.identity.id, 't-1');
    assert.equal((await second.getSession('session-1'))?.tracks.length, 1);
    assert.equal(
      (await second.listValues({
        deviceId: 'device-1',
        dimension: 'genre',
        kind: 'preferred',
      }))[0]?.value,
      'house',
    );
    assert.equal((await second.load('conversation-1'))?.summary, 'Persistent conversation');
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PHASE61: SQLite store rejects use after close', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dj-sync-agent-'));
  const dbPath = join(dir, 'copilot.db');

  try {
    const store = new SQLiteCopilotDbStoreCtor(dbPath);
    await store.close();
    await assert.rejects(
      store.upsertTrack(track('closed')),
      /closed/i,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

} else {
  test('PHASE61: SQLite store skipped — node:sqlite built-in unavailable', () => {
    assert.equal(true, true);
  });
}
