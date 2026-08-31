import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedTrack } from '../../rekordbox/normalized-track.js';
import type { DJCue } from '../domain/dj-cue.js';
import type { DJPlaylist } from '../domain/dj-playlist.js';
import { InMemoryCopilotDbStore } from './in-memory-store.js';
import { toNormalizedTrackRow, toDJTrackFromRow, toPlaylistRows, toDJPlaylistFromRow, toCueRows, toDJCuesFromRows } from './codec.js';

type NormalizedTrackPartial = {
  identity?: Partial<NormalizedTrack['identity']>;
  metadata?: Partial<NormalizedTrack['metadata']>;
  technical?: Partial<NormalizedTrack['technical']>;
  primaryFile?: Partial<NormalizedTrack['primaryFile']>;
  files?: NormalizedTrack['files'];
  cues?: NormalizedTrack['cues'];
  playlists?: NormalizedTrack['playlists'];
  sync?: Partial<NormalizedTrack['sync']>;
};

function buildTrack(overrides: NormalizedTrackPartial = {}): NormalizedTrack {
  const id = overrides.identity?.id ?? crypto.randomUUID();
  return {
    schemaVersion: 1,
    identity: { id, uuid: overrides.identity?.uuid ?? id, ...overrides.identity },
    metadata: {
      title: 'Track Title',
      artist: 'Artist Name',
      album: 'Album Name',
      genre: 'Melodic Techno',
      label: 'Some Label',
      key: '8A',
      remixer: null,
      composer: null,
      isrc: null,
      ...overrides.metadata,
    },
    technical: {
      bpmRaw: 120.0,
      bpm: 120,
      lengthSeconds: 300,
      bitrate: 320,
      bitDepth: 16,
      sampleRate: 44100,
      rating: 5,
      playCount: 12,
      fileType: 1,
      analyzed: 1,
      ...overrides.technical,
    },
    primaryFile: {
      id: 'pf:1',
      path: '/Users/foo/Music/song.mp3',
      localPath: '/Users/foo/Music/song.mp3',
      hash: 'aaaa',
      size: 10_000_000,
      kind: 'media',
      ...overrides.primaryFile,
    },
    files: overrides.files ?? [],
    cues: overrides.cues ?? [],
    playlists: overrides.playlists ?? [{ playlistId: 'pl-1', playlistName: 'My Set', trackNo: 1 }],
    sync: {
      rbLocalDeleted: null,
      rbLocalUsn: 100,
      updatedAt: new Date('2026-01-01').toISOString(),
      ...overrides.sync,
    },
  };
}

void describe('PHASE39 — codec roundtrip + LocalReadModelStore', () => {
  void it('NormalizedTrack codec row round trip keeps JSON fidelity', () => {
    const original = buildTrack({ metadata: { title: 'Original Song', artist: 'Adana Twins' } });
    const row = toNormalizedTrackRow(original);
    assert.equal(row.track_id, original.identity.id);
    assert.equal(row.bpm, 120);
    assert.equal(row.musical_key, '8A');
    assert.equal(row.primary_file_local_path, '/Users/foo/Music/song.mp3');
    const decoded = toDJTrackFromRow(row);
    assert.deepEqual(decoded, original);
  });

  void it('Playlist + entries codec round trip', () => {
    const playlist: DJPlaylist = {
      id: 'pl-1',
      name: 'Peak Time',
      parentId: null,
      source: 'rekordbox',
      updatedAt: '2026-01-01T00:00:00.000Z',
      trackIds: ['a', 'b', 'c'],
    };
    const { row, entries } = toPlaylistRows(playlist);
    assert.equal(row.track_count, 3);
    assert.equal(entries.length, 3);
    assert.equal(entries[0]!.track_no, 1);
    assert.equal(entries[2]!.track_id, 'c');
    const restored = toDJPlaylistFromRow(row, entries);
    assert.deepEqual(restored, playlist);
  });

  void it('Cues codec round trip sorts by in_msec', () => {
    const cues: DJCue[] = [
      { id: 'cue-2', trackId: 't', type: 'memory', positionSeconds: 60, name: 'drop', color: null, comment: null, order: 1 },
      { id: 'cue-1', trackId: 't', type: 'cue', positionSeconds: 10, name: 'intro', color: '1', comment: 'intro cue', order: 0 },
    ];
    const rows = toCueRows('t', cues);
    assert.equal(rows.length, 2);
    const restored = toDJCuesFromRows(rows);
    assert.equal(restored[0]!.id, 'cue-1');
    assert.equal(restored[0]!.positionSeconds, 10);
    assert.equal(restored[1]!.id, 'cue-2');
    assert.equal(restored[1]!.positionSeconds, 60);
  });

  void it('InMemoryCopilotDbStore: upsert/get/search/list tracks + stats', async () => {
    const store = new InMemoryCopilotDbStore();
    const t1 = buildTrack({ identity: { id: 't-1', uuid: 'u-1' }, metadata: { title: 'T1', artist: 'ARTIST_A', genre: 'Techno' }, technical: { bpmRaw: 126, bpm: 126 } });
    const t2 = buildTrack({ identity: { id: 't-2', uuid: 'u-2' }, metadata: { title: 'T2', artist: 'ARTIST_B', genre: 'House' }, technical: { bpmRaw: 118, bpm: 118 } });
    const t3 = buildTrack({ identity: { id: 't-3', uuid: 'u-3' }, metadata: { title: 'T3', artist: 'ARTIST_A', genre: 'Techno' }, technical: { bpmRaw: 130, bpm: 130, rating: null } });

    await store.upsertTracks([t1, t2, t3]);

    assert.equal((await store.listTrackIds()).length, 3);
    assert.equal((await store.getTrack('t-1'))?.identity.id, 't-1');
    assert.equal(await store.getTrack('missing'), null);

    const genreTechno = await store.searchTracks({ genre: 'Techno' });
    assert.equal(genreTechno.total, 2);

    const bpmRange = await store.searchTracks({ bpmMin: 120, bpmMax: 128 });
    assert.equal(bpmRange.total, 1);

    const byText = await store.searchTracks({ text: 'ARTIST_B' });
    assert.equal(byText.total, 1);

    const stats = await store.getLibraryStats();
    assert.equal(stats.trackCount, 3);
    assert.equal(stats.averageBpm, (126 + 118 + 130) / 3);
    assert.equal(stats.analyzedTracks, 3);
    assert.equal(stats.ratedTracks, 2);

    await store.close();
  });

  void it('InMemoryCopilotDbStore: playlists + cues', async () => {
    const store = new InMemoryCopilotDbStore();
    await store.upsertTrack(buildTrack({ identity: { id: 't-1', uuid: 'u-1' } }));
    await store.upsertTrack(buildTrack({ identity: { id: 't-2', uuid: 'u-2' } }));
    const playlist: DJPlaylist = {
      id: 'pl-prime',
      name: 'Prime',
      parentId: null,
      source: 'local',
      updatedAt: new Date('2026-01-01').toISOString(),
      trackIds: ['t-1', 't-2'],
    };
    await store.upsertPlaylist(playlist);
    const got = await store.getPlaylist('pl-prime');
    assert.ok(got);
    assert.equal(got!.trackIds.length, 2);
    assert.deepEqual(got!.trackIds, ['t-1', 't-2']);
    assert.equal((await store.listPlaylists()).length, 1);

    const cues: DJCue[] = [
      { id: 'c-1', trackId: 't-1', type: 'cue', positionSeconds: 15.5, name: 'Intro', color: null, comment: null, order: 0 },
      { id: 'c-2', trackId: 't-1', type: 'hot', positionSeconds: 60.0, name: 'Drop', color: '3', comment: 'Hot Cue', order: 1 },
    ];
    await store.upsertCues('t-1', cues);
    const gotCues = await store.getCues('t-1');
    assert.equal(gotCues.length, 2);
    assert.equal(gotCues[0]!.id, 'c-1');
    assert.equal(gotCues[1]!.id, 'c-2');

    await store.close();
  });
});
