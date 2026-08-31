import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRekordboxWritePort } from './rekordbox-write-port.js';
import type { DJPlaylist } from '../core/domain/dj-playlist.js';
import type { NormalizedTrack } from './normalized-track.js';

function track(id: string): NormalizedTrack {
  return {
    schemaVersion: 1,
    identity: { id, uuid: null },
    metadata: { title: `Track ${id}`, artist: 'Artist', album: null, genre: 'House', label: null, key: '8A', remixer: null, composer: null, isrc: null },
    technical: { bpmRaw: 125, bpm: 125, lengthSeconds: 180, bitrate: 320, bitDepth: null, sampleRate: 44100, rating: 0, playCount: 0, fileType: null, analyzed: 1 },
    primaryFile: { id: null, path: `/music/${id}.mp3`, localPath: `/music/${id}.mp3`, hash: null, size: 1, kind: 'media' },
    files: [], cues: [], playlists: [], sync: { rbLocalDeleted: 0, rbLocalUsn: 1, updatedAt: null },
  };
}

function playlist(id: string, name: string, trackIds: string[]): DJPlaylist {
  return { id, name, trackIds, parentId: null, source: 'rekordbox', updatedAt: null };
}

test('PHASE64: export writes an XML artifact and never touches master.db', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'dj-sync-agent-phase64-'));
  try {
    const port = createRekordboxWritePort({
      outputDir,
      listPlaylists: async () => [playlist('1', 'House', ['1'])],
      getTrack: async (id) => track(id),
      now: () => '2026-08-31T10:00:00.000Z',
    });
    const result = await port.exportCollection();
    assert.equal(result.status, 'staged');
    assert.equal(result.masterDbTouched, false);
    assert.match(result.outputPath, /rekordbox-export-2026-08-31T10-00-00-000Z\.xml$/);
    assert.match(await readFile(result.outputPath, 'utf8'), /House/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('PHASE64: createPlaylist stages a new playlist and requires no database write', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'dj-sync-agent-phase64-'));
  try {
    const port = createRekordboxWritePort({
      outputDir,
      listPlaylists: async () => [playlist('1', 'House', ['1'])],
      getTrack: async (id) => track(id),
      now: () => '2026-08-31T10:01:00.000Z',
    });
    const result = await port.createPlaylist('New Set');
    assert.equal(result.status, 'staged');
    assert.match(await readFile(result.outputPath, 'utf8'), /New Set/);
    assert.equal(result.masterDbTouched, false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('PHASE64: appendToTempPlaylist stages a deduplicated temporary playlist', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'dj-sync-agent-phase64-'));
  try {
    const port = createRekordboxWritePort({
      outputDir,
      listPlaylists: async () => [playlist('1', 'House', ['1'])],
      getTrack: async (id) => track(id),
      now: () => '2026-08-31T10:02:00.000Z',
    });
    const result = await port.appendToTempPlaylist('1');
    const xml = await readFile(result.outputPath, 'utf8');
    assert.match(xml, /DJ Copilot Temp/);
    assert.equal((xml.match(/Key="1"/g) ?? []).length, 2);
    assert.equal(result.masterDbTouched, false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('PHASE64: refuses duplicate root playlist creation', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'dj-sync-agent-phase64-'));
  try {
    const port = createRekordboxWritePort({
      outputDir,
      listPlaylists: async () => [playlist('1', 'House', ['1'])],
      getTrack: async (id) => track(id),
      now: () => '2026-08-31T10:03:00.000Z',
    });
    await assert.rejects(() => port.createPlaylist('house'), /already exists/i);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
