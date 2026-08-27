import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlaylistActions,
} from './playlist-actions.js';

test('playlist actions normalize identifiers', async () => {
  let received = '';

  const actions =
    createPlaylistActions({
      async addTrack(
        playlistId,
        trackId,
      ) {
        received =
          `${playlistId}:${trackId}`;
      },

      async removeTrack() {},

      async createPlaylist() {
        throw new Error(
          'not used',
        );
      },
    });

  await actions.addTrack(
    ' playlist-1 ',
    ' track-1 ',
  );

  assert.equal(
    received,
    'playlist-1:track-1',
  );
});
