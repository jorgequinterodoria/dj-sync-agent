import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlaylistTrackCount, type DJPlaylist } from './dj-playlist.js';
import { normalizeHistoryQuery } from './dj-history.js';
import { sortCues, type DJCue } from './dj-cue.js';
import { CueService, InMemoryCueSource } from '../library/cue-service.js';
import { HistoryService, InMemoryHistorySource } from '../library/history-service.js';
import { PlaylistService, InMemoryPlaylistSource } from '../library/playlist-service.js';

test('playlist domain counts tracks', () => {
  const playlist: DJPlaylist = { id: 'p1', name: 'House', trackIds: ['1', '2'], parentId: null, source: 'rekordbox', updatedAt: null };
  assert.equal(getPlaylistTrackCount(playlist), 2);
});

test('history query normalizes limit deterministically', () => {
  assert.equal(normalizeHistoryQuery({ limit: 0 }).limit, 1);
  assert.equal(normalizeHistoryQuery({ limit: 5000 }).limit, 1000);
});

test('playlist service resolves and orders playlists', async () => {
  const service = new PlaylistService(new InMemoryPlaylistSource([
    { id: '2', name: 'Techno', trackIds: [], parentId: null, source: 'rekordbox', updatedAt: null },
    { id: '1', name: 'House', trackIds: [], parentId: null, source: 'rekordbox', updatedAt: null },
  ]));
  assert.equal((await service.getPlaylist(' 1 '))?.name, 'House');
  assert.deepEqual((await service.searchPlaylists()).map((playlist) => playlist.id), ['1', '2']);
});

test('history service filters and sorts newest first', async () => {
  const service = new HistoryService(new InMemoryHistorySource([
    { id: 'old', trackId: '1', playedAt: '2026-08-01T10:00:00Z', source: 'rekordbox', deviceId: null, position: null },
    { id: 'new', trackId: '1', playedAt: '2026-08-02T10:00:00Z', source: 'rekordbox', deviceId: null, position: null },
  ]));
  const result = await service.getHistory({ trackId: '1' });
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((entry) => entry.id), ['new', 'old']);
});

test('cue service returns deterministic cue ordering', async () => {
  const cues: DJCue[] = [
    { id: 'b', trackId: '1', type: 'cue', positionSeconds: 20, name: null, color: null, comment: null, order: 1 },
    { id: 'a', trackId: '1', type: 'cue', positionSeconds: 10, name: null, color: null, comment: null, order: 0 },
  ];
  const service = new CueService(new InMemoryCueSource({ '1': cues }));
  assert.deepEqual((await service.getCues('1')).map((cue) => cue.id), ['a', 'b']);
  assert.equal((await service.getCue('1', 'b'))?.positionSeconds, 20);
});

test('cue sort is stable by position, order and id', () => {
  const sorted = sortCues([
    { id: 'z', trackId: '1', type: 'cue', positionSeconds: 10, name: null, color: null, comment: null, order: 2 },
    { id: 'a', trackId: '1', type: 'cue', positionSeconds: 10, name: null, color: null, comment: null, order: 2 },
  ]);
  assert.deepEqual(sorted.map((cue) => cue.id), ['a', 'z']);
});
