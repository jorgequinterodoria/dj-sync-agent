import assert from 'node:assert/strict';
import test from 'node:test';

import { createRekordboxSafeActionExecutor } from './rekordbox-safe-action-executor.js';

test('PHASE64: approved create playlist is routed to the safe XML write port', async () => {
  let name = '';
  const executor = createRekordboxSafeActionExecutor({
    async createPlaylist(value) {
      name = value;
      return { status: 'staged', operation: 'create_playlist', outputPath: '/tmp/x.xml', playlistCount: 1, trackCount: 0, masterDbTouched: false };
    },
    async appendToTempPlaylist() { throw new Error('unused'); },
    async exportCollection() { throw new Error('unused'); },
  });
  const result = await executor.execute({
    action: { type: 'playlist.create', playlistName: 'Peak' },
    actionHash: 'hash', affectedResources: [], reversible: false,
  });
  assert.equal(name, 'Peak');
  assert.equal((result as { masterDbTouched: boolean }).masterDbTouched, false);
});

test('PHASE64: playlist add only permits the explicit temporary playlist route', async () => {
  let trackId = '';
  const executor = createRekordboxSafeActionExecutor({
    async createPlaylist() { throw new Error('unused'); },
    async appendToTempPlaylist(value) {
      trackId = value;
      return { status: 'staged', operation: 'append_to_temp_playlist', outputPath: '/tmp/x.xml', playlistCount: 1, trackCount: 1, masterDbTouched: false };
    },
    async exportCollection() { throw new Error('unused'); },
  });
  await executor.execute({
    action: { type: 'playlist.add', playlistId: 'temp', trackId: '7' },
    actionHash: 'hash', affectedResources: [], reversible: true,
  });
  assert.equal(trackId, '7');
  await assert.rejects(
    () => executor.execute({ action: { type: 'playlist.add', playlistId: 'real', trackId: '7' }, actionHash: 'hash', affectedResources: [], reversible: true }),
    /Direct Rekordbox playlist mutation is disabled/,
  );
});
