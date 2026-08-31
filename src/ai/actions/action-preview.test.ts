import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActionPreview,
  hashActionPreview,
} from './action-preview.js';

test('action preview normalizes resources', () => {
  const preview = createActionPreview({
    action: {
      type: 'playlist.add',
    },
    reason: 'Add track.',
    risk: 'write',
    affectedResources: [
      'track-1',
      ' track-1 ',
      '',
      'playlist-1',
    ],
    reversible: true,
    id: 'preview-1',
  });

  assert.deepEqual(
    preview.affectedResources,
    ['track-1', 'playlist-1'],
  );
});

test('action preview hash is deterministic', () => {
  const preview = createActionPreview({
    action: {
      type: 'playlist.add',
      trackId: 'track-1',
    },
    reason: 'Add track.',
    risk: 'write',
    affectedResources: ['track-1'],
    reversible: true,
    id: 'preview-1',
  });

  assert.equal(
    hashActionPreview(preview),
    hashActionPreview(preview),
  );
});

test('action preview rejects blank reason', () => {
  assert.throws(
    () =>
      createActionPreview({
        action: {},
        reason: ' ',
        risk: 'write',
        affectedResources: [],
        reversible: true,
      }),
    {
      message:
        'Action preview reason is required.',
    },
  );
});
