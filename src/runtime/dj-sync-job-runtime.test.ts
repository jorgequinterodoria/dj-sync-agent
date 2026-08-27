import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncJobRuntime,
} from './dj-sync-job-runtime.js';

test(
  'job runtime exposes disabled state when device id is missing',
  () => {
    const runtime =
      createDJSyncJobRuntime({
        deviceId: '',
        apiUrl: 'https://example.com',
        apiKey: 'test-key',
      });

    const snapshot =
      runtime.snapshot();

    assert.equal(
      snapshot.configured,
      false,
    );

    assert.equal(
      snapshot.status,
      'disabled',
    );

    assert.equal(
      snapshot.workerId,
      null,
    );
  },
);

test(
  'job runtime exposes disabled state when api key is missing',
  () => {
    const runtime =
      createDJSyncJobRuntime({
        deviceId:
          'macbook-air-jorge-1',
        apiUrl:
          'https://example.com',
        apiKey: '',
      });

    const snapshot =
      runtime.snapshot();

    assert.equal(
      snapshot.configured,
      false,
    );

    assert.equal(
      snapshot.status,
      'disabled',
    );

    assert.equal(
      snapshot.workerId,
      null,
    );
  },
);

test(
  'job runtime rejects unsupported api protocols',
  () => {
    assert.throws(
      () =>
        createDJSyncJobRuntime({
          deviceId:
            'macbook-air-jorge-1',
          apiUrl:
            'ftp://example.com',
          apiKey:
            'test-key',
        }),
      {
        message:
          /Unsupported intelligence jobs API protocol/,
      },
    );
  },
);

test(
  'job runtime creates successfully with valid configuration',
  () => {
    const runtime =
      createDJSyncJobRuntime({
        deviceId:
          'macbook-air-jorge-1',
        apiUrl:
          'https://example.com',
        apiKey:
          'test-key',
      });

    assert.equal(
      typeof runtime.start,
      'function',
    );

    assert.equal(
      typeof runtime.stop,
      'function',
    );

    assert.equal(
      typeof runtime.runOnce,
      'function',
    );

    assert.equal(
      typeof runtime.snapshot,
      'function',
    );
  },
);

test(
  'job runtime can stop before starting',
  async () => {
    const runtime =
      createDJSyncJobRuntime({
        deviceId:
          'macbook-air-jorge-1',
        apiUrl:
          'https://example.com',
        apiKey:
          'test-key',
      });

    await assert.doesNotReject(
      () =>
        runtime.stop(),
    );
  },
);

test(
  'job runtime exposes disabled state when backend configuration is missing',
  () => {
    const runtime =
      createDJSyncJobRuntime({
        deviceId:
          'macbook-air-jorge-1',
        apiUrl:
          null,
        apiKey:
          null,
      });

    const snapshot =
      runtime.snapshot();

    assert.equal(
      snapshot.configured,
      false,
    );

    assert.equal(
      snapshot.status,
      'disabled',
    );

    assert.equal(
      snapshot.workerId,
      null,
    );
  },
);