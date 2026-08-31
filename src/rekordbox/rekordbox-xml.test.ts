import assert from 'node:assert/strict';
import test from 'node:test';

import { renderRekordboxPlaylistXml } from './rekordbox-xml.js';
import type { DJPlaylist } from '../core/domain/dj-playlist.js';
import type { NormalizedTrack } from './normalized-track.js';

function track(id: string, title = 'Track & One'): NormalizedTrack {
  return {
    schemaVersion: 1,
    identity: { id, uuid: null },
    metadata: {
      title, artist: 'Artist <A>', album: 'Album', genre: 'House', label: 'Label',
      key: '8A', remixer: null, composer: null, isrc: null,
    },
    technical: {
      bpmRaw: 125, bpm: 125, lengthSeconds: 180, bitrate: 320, bitDepth: 24,
      sampleRate: 44100, rating: 5, playCount: 3, fileType: null, analyzed: 1,
    },
    primaryFile: {
      id: 'file-1', path: '/music/track one.mp3', localPath: '/music/track one.mp3',
      hash: null, size: 123, kind: 'media',
    },
    files: [], cues: [], playlists: [],
    sync: { rbLocalDeleted: 0, rbLocalUsn: 1, updatedAt: '2026-08-31T00:00:00Z' },
  };
}

function playlist(id: string, name: string, trackIds: string[], parentId: string | null = null): DJPlaylist {
  return { id, name, trackIds, parentId, source: 'rekordbox', updatedAt: null };
}

test('PHASE64: renders Rekordbox XML with escaped metadata and file URI', () => {
  const result = renderRekordboxPlaylistXml({
    playlists: [playlist('10', 'House & Warm', ['1'])],
    tracks: [{ track: track('1') }],
  });

  assert.match(result.xml, /^<\?xml version="1\.0" encoding="UTF-8" \?>/);
  assert.match(result.xml, /Version="1\.0\.0"/);
  assert.match(result.xml, /Name="Track &amp; One"/);
  assert.match(result.xml, /Artist &lt;A&gt;/);
  assert.match(result.xml, /Location="file:\/\/\/music\/track%20one\.mp3"/);
  assert.match(result.xml, /<NODE Type="1" Name="House &amp; Warm" Entries="1" KeyType="0">/);
  assert.equal(result.playlistCount, 1);
  assert.equal(result.trackCount, 1);
});

test('PHASE64: preserves nested playlist folders deterministically', () => {
  const result = renderRekordboxPlaylistXml({
    playlists: [
      playlist('2', 'Peak', ['1'], '1'),
      playlist('1', 'Sets', [], null),
      playlist('3', 'Warmup', ['2'], null),
    ],
    tracks: [{ track: track('1') }, { track: track('2', 'Second') }],
  });

  const sets = result.xml.indexOf('<NODE Type="0" Name="Sets" Count="1">');
  const peak = result.xml.indexOf('<NODE Type="1" Name="Peak" Entries="1" KeyType="0">');
  assert.ok(sets >= 0);
  assert.ok(peak > sets);
});

test('PHASE64: rejects missing playlist tracks and non-numeric TrackIDs', () => {
  assert.throws(
    () => renderRekordboxPlaylistXml({ playlists: [playlist('1', 'P', ['404'])], tracks: [] }),
    /missing track 404/i,
  );
  assert.throws(
    () => renderRekordboxPlaylistXml({ playlists: [playlist('1', 'P', ['abc'])], tracks: [{ track: track('abc') }] }),
    /requires numeric TrackID/i,
  );
});
