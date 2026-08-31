import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActionMapper,
} from './action-mapper.js';

test('action mapper validates playlist add', () => {
  const mapper =
    createActionMapper();

  const result =
    mapper.validate({
      type: 'playlist.add',
      playlistId: 'playlist-1',
      trackId: 'track-1',
    });

  assert.equal(
    result.action.type,
    'playlist.add',
  );

  assert.equal(
    result.affectedResources[0],
    'playlist:playlist-1',
  );

  assert.equal(
    result.reversible,
    true,
  );
});

test('action mapper rejects missing action data', () => {
  const mapper =
    createActionMapper();

  assert.throws(
    () =>
      mapper.validate({
        type: 'playlist.add',
        trackId: 'track-1',
      }),
    {
      message:
        'playlistId is required.',
    },
  );
});

test('action mapper rejects malformed objects', () => {
  const mapper =
    createActionMapper();

  assert.throws(
    () =>
      mapper.validate(null),
    {
      message:
        'DJ action must be an object.',
    },
  );
});
