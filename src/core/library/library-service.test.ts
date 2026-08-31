import assert from 'node:assert/strict';
import test from 'node:test';

import type { NormalizedTrack } from '../../rekordbox/normalized-track.js';
import {
  LibraryService,
  type LibrarySource,
} from './library-service.js';
import type { TrackSnapshot } from '../../sync/snapshot-store.js';

function createTrack(overrides: Partial<NormalizedTrack> = {}): NormalizedTrack {
  return {
    schemaVersion: 1,
    identity: {
      id: '1',
      uuid: null,
    },
    metadata: {
      title: 'Track',
      artist: 'Artist',
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
      bitrate: 320000,
      bitDepth: null,
      sampleRate: 44100,
      rating: 5,
      playCount: 3,
      fileType: null,
      analyzed: 1,
    },
    primaryFile: {
      id: 'file-1',
      path: '/Music/track.wav',
      localPath: '/Music/track.wav',
      hash: 'hash-1',
      size: 100,
      kind: 'media',
    },
    files: [],
    cues: [],
    playlists: [
      {
        playlistId: 'playlist-1',
        playlistName: 'Warmup',
        trackNo: 1,
      },
    ],
    sync: {
      rbLocalDeleted: 0,
      rbLocalUsn: 10,
      updatedAt: '2026-08-27T00:00:00.000Z',
    },
    ...overrides,
  };
}

function createSource(
  tracks: NormalizedTrack[],
): LibrarySource {
  const snapshot: TrackSnapshot = {
    schemaVersion: 1,
    generatedAt: '2026-08-27T00:00:00.000Z',
    trackCount: tracks.length,
    tracks: Object.fromEntries(
      tracks.map((track) => [
        track.identity.id,
        {
          id: track.identity.id,
          uuid: track.identity.uuid,
          hash: track.primaryFile.hash ?? track.identity.id,
          updatedAt: track.sync.updatedAt,
          rbLocalUsn: track.sync.rbLocalUsn,
          track,
        },
      ]),
    ),
  };

  return {
    async load() {
      return snapshot;
    },
  };
}

test('library service returns a track by id', async () => {
  const service = new LibraryService(
    createSource([createTrack()]),
  );

  const track = await service.getTrack(' 1 ');
  assert.equal(track?.identity.id, '1');
});

test('library service searches with stable ordering and filters', async () => {
  const service = new LibraryService(
    createSource([
      createTrack({
        identity: { id: '2', uuid: null },
        metadata: {
          ...createTrack().metadata,
          title: 'Beta',
          artist: 'Other',
          genre: 'Techno',
        },
      }),
      createTrack(),
    ]),
  );

  const result = await service.searchTracks({
    genre: 'house',
    bpmMin: 120,
    hasLocalFile: true,
    limit: 10,
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.identity.id, '1');
});

test('library service computes aggregate statistics', async () => {
  const service = new LibraryService(
    createSource([
      createTrack(),
      createTrack({
        identity: { id: '2', uuid: null },
        technical: {
          ...createTrack().technical,
          bpm: 126,
          rating: null,
          analyzed: 0,
        },
        primaryFile: {
          ...createTrack().primaryFile,
          localPath: null,
        },
      }),
    ]),
  );

  const stats = await service.getLibraryStats();

  assert.equal(stats.trackCount, 2);
  assert.equal(stats.tracksWithLocalFile, 1);
  assert.equal(stats.analyzedTracks, 1);
  assert.equal(stats.ratedTracks, 1);
  assert.equal(stats.averageBpm, 125);
});

test('library service clamps a valid search limit', async () => {
  const service = new LibraryService(createSource([createTrack()]));
  const result = await service.searchTracks({ limit: 5000 });
  assert.equal(result.limit, 1000);
});
