import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncRealActionExecutor,
} from './dj-sync-real-action-executor.js';

test('real action executor routes playlist add to core action', async () => {
  let received = '';

  const executor =
    createDJSyncRealActionExecutor({
      playlists: {
        async addTrack(
          playlistId,
          trackId,
        ) {
          received =
            `${playlistId}:${trackId}`;
        },
        async removeTrack() {},
        async createPlaylist() {
          throw new Error('unused');
        },
      },
      cues: {
        async createCue() {
          throw new Error('unused');
        },
        async removeCue() {},
      },
    });

  const result =
    await executor.execute({
      action: {
        type: 'playlist.add',
        playlistId: 'playlist-1',
        trackId: 'track-1',
      },
      actionHash: 'hash-1',
      affectedResources: [],
      reversible: true,
    });

  assert.equal(
    received,
    'playlist-1:track-1',
  );

  assert.deepEqual(
    result,
    {
      status: 'executed',
      actionHash: 'hash-1',
    },
  );
});

test('real action executor converts core failures into structured failures', async () => {
  const executor =
    createDJSyncRealActionExecutor({
      playlists: {
        async addTrack() {
          throw new Error(
            'playlist update failed',
          );
        },
        async removeTrack() {},
        async createPlaylist() {
          throw new Error('unused');
        },
      },
      cues: {
        async createCue() {
          throw new Error('unused');
        },
        async removeCue() {},
      },
    });

  const result =
    await executor.execute({
      action: {
        type: 'playlist.add',
        playlistId: 'playlist-1',
        trackId: 'track-1',
      },
      actionHash: 'hash-2',
      affectedResources: [],
      reversible: true,
    });

  assert.deepEqual(
    result,
    {
      status: 'failed',
      actionHash: 'hash-2',
      error: 'playlist update failed',
    },
  );
});
