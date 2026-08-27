import assert from 'node:assert/strict';
import test from 'node:test';
import { createDJSyncSetBuilderService } from './dj-sync-set-builder-service.js';

test('set builder service resolves tracks from source', async () => {
  const service = createDJSyncSetBuilderService({
    async getTrack(trackId) {
      return {
        trackId,
        title: null,
        artist: `artist-${trackId}`,
        genre: 'house',
        key: '8A',
        bpm: 120,
        energy: 0.5,
        rating: 4,
        playCount: 2,
        recentlyPlayed: false,
        durationSeconds: 240,
      };
    },
  });

  const result = await service.build({
    deviceId: 'device-1',
    request: 'build set',
    trackIds: ['a', 'b'],
    trackCount: 2,
  });

  assert.equal(result.tracks.length, 2);
});

test('set builder service analyzes resolved tracks', async () => {
  const service = createDJSyncSetBuilderService({
    async getTrack(trackId) {
      return {
        trackId,
        title: null,
        artist: `artist-${trackId}`,
        genre: 'house',
        key: '8A',
        bpm: 120,
        energy: 0.5,
        rating: 4,
        playCount: 2,
        recentlyPlayed: false,
        durationSeconds: 240,
      };
    },
  });

  const result = await service.analyze({
    deviceId: 'device-1',
    request: 'analyze set',
    trackIds: ['a', 'b', 'c'],
  });

  assert.equal(result.analysis.satisfiedTrackCount, 3);
});
