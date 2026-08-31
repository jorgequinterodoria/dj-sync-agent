import {
  test,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  IPC_CHANNELS,
} from './channels.js';

test(
  'IPC channels are unique',
  () => {
    const values =
      Object.values(
        IPC_CHANNELS,
      );

    assert.equal(
      new Set(values).size,
      values.length,
    );
  },
);

test(
  'IPC channels expose the public application contract',
  () => {
    assert.equal(
      IPC_CHANNELS.appGetInfo,
      'app:get-info',
    );

    assert.equal(
      IPC_CHANNELS.applicationGetState,
      'application:get-state',
    );

    assert.equal(
      IPC_CHANNELS.applicationRefresh,
      'application:refresh',
    );

    assert.equal(
      IPC_CHANNELS.applicationStart,
      'application:start',
    );

    assert.equal(
      IPC_CHANNELS.applicationStop,
      'application:stop',
    );

    assert.equal(
      IPC_CHANNELS.applicationRestart,
      'application:restart',
    );

    assert.equal(
      IPC_CHANNELS.applicationUpdate,
      'application:update',
    );
  },
);