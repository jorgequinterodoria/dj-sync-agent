import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SQLiteCopilotDbStore } from './core/local-store/sqlite-store.js';
import { createDefaultCopilotAgentToolPolicy, COPILOT_AGENT_TOOL_ALLOWLIST } from './ai/agent/copilot-tool-policy.js';
import { HybridNowPlayingSource } from './core/live/hybrid-now-playing-source.js';
import { ManualNowPlayingSource } from './core/live/now-playing-port.js';

test('F68.4 final consolidation keeps Copilot allow-list closed', () => {
  const policy = createDefaultCopilotAgentToolPolicy();
  assert.deepEqual(policy.registered(), [...COPILOT_AGENT_TOOL_ALLOWLIST].sort((a, b) => a.localeCompare(b)));
  assert.equal(policy.decide('filesystem.exec').allowed, false);
});

test('F68.5 final consolidation persists a DJ track across store restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dj-sync-final-'));
  const dbPath = join(dir, 'copilot.db');
  const track = {
    schemaVersion: 1 as const,
    identity: { id: 'final-track', uuid: 'final-track' },
    metadata: { title: 'Final Track', artist: 'Final Artist', album: null, genre: 'House', label: null, key: '8A', remixer: null, composer: null, isrc: null },
    technical: { bpmRaw: 124, bpm: 124, lengthSeconds: 300, bitrate: 320, bitDepth: 16, sampleRate: 44100, rating: 4, playCount: 1, fileType: 1, analyzed: 1 },
    primaryFile: { id: 'final-file', path: '/tmp/final.mp3', localPath: '/tmp/final.mp3', hash: null, size: 1, kind: 'media' as const },
    files: [], cues: [], playlists: [],
    sync: { rbLocalDeleted: null, rbLocalUsn: 1, updatedAt: '2026-08-31T00:00:00.000Z' },
  };
  try {
    const first = new SQLiteCopilotDbStore(dbPath);
    await first.upsertTrack(track);
    await first.close();
    const second = new SQLiteCopilotDbStore(dbPath);
    const restored = await second.getTrack('final-track');
    assert.equal(restored?.metadata.title, 'Final Track');
    assert.equal(restored?.metadata.genre, 'House');
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('F68.6 final consolidation keeps manual fallback available without hardware', async () => {
  const fallback = new ManualNowPlayingSource();
  fallback.pushTrack({ trackId: 'fallback-track', title: 'Fallback' });
  const source = new HybridNowPlayingSource({ fallback, primary: {
    name: 'UnavailablePrimary', sourceType: 'rekordbox_active_cue_polling',
    async getCurrent() { return null; },
    async close() {},
  } });
  const current = await source.getCurrent();
  assert.equal(current?.trackId, 'fallback-track');
  await source.close();
});
