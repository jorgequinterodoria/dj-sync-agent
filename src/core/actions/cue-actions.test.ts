import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCueActions,
} from './cue-actions.js';

test(
  'cue actions normalize track id',
  async () => {
    let received = '';

    const actions =
      createCueActions({
        async createCue(input) {
          received =
            input.trackId;

          return input as never;
        },

        async removeCue() {},
      });

    await actions.createCue({
      id: 'cue-1',
      trackId: ' track-1 ',
      type: 'memory',
      positionSeconds: 12,
      name: null,
      comment: null,
      color: null,
      order: 0,
    });

    assert.equal(
      received,
      'track-1',
    );
  },
);