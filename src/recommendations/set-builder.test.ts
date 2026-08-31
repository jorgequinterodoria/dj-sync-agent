import assert from 'node:assert/strict';
import test from 'node:test';
import { createSetBuilder } from './set-builder.js';

function candidate(
  trackId: string,
  bpm: number,
  key: string,
  energy: number,
  artist: string,
  genre: string,
) {
  return {
    trackId,
    bpm,
    key,
    energy,
    artist,
    genre,
    rating: 4,
    playCount: 10,
    recentlyPlayed: false,
    durationSeconds: 240,
  };
}

test('set builder creates deterministic progression', () => {
  const builder = createSetBuilder({
    now: () => '2026-08-27T00:00:00Z',
    id: () => 'set-1',
  });

  const result = builder.build({
    deviceId: 'device-1',
    request: 'build a house set',
    startTrack: candidate('start', 120, '8A', 0.5, 'Artist A', 'house'),
    candidates: [
      candidate('good-1', 122, '8A', 0.55, 'Artist B', 'house'),
      candidate('good-2', 124, '9A', 0.62, 'Artist C', 'house'),
      candidate('bad-bpm', 145, '9A', 0.65, 'Artist D', 'house'),
    ],
    trackCount: 3,
  });

  assert.equal(result.setId, 'set-1');
  assert.deepEqual(
    result.tracks.map((item) => item.track.trackId),
    ['start', 'good-1', 'good-2'],
  );
  assert.equal(result.analysis.requestedTrackCount, 3);
  assert.equal(result.analysis.satisfiedTrackCount, 3);
});

test('set builder avoids repeated artists by default', () => {
  const builder = createSetBuilder({
    now: () => '2026-08-27T00:00:00Z',
    id: () => 'set-2',
  });

  const result = builder.build({
    deviceId: 'device-1',
    request: 'avoid repeated artists',
    startTrack: candidate('start', 120, '8A', 0.5, 'Artist A', 'house'),
    candidates: [
      candidate('same', 121, '8A', 0.51, 'Artist A', 'house'),
      candidate('different', 122, '8A', 0.52, 'Artist B', 'house'),
    ],
    trackCount: 2,
  });

  assert.equal(result.tracks[1]?.track.trackId, 'different');
});

test('set builder never invents unavailable tracks', () => {
  const builder = createSetBuilder({
    now: () => '2026-08-27T00:00:00Z',
    id: () => 'set-3',
  });

  const result = builder.build({
    deviceId: 'device-1',
    request: 'three track set',
    candidates: [
      candidate('one', 120, '8A', 0.5, 'Artist A', 'house'),
    ],
    trackCount: 3,
  });

  assert.equal(result.tracks.length, 1);
  assert.ok(
    result.analysis.warnings.some(
      (warning) => /could not be fully satisfied/i.test(warning),
    ),
  );
});
