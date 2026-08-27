import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncJobRuntime,
} from './dj-sync-job-runtime.js';

test(
  'job runtime validates required device id',
  () => {
    assert.throws(
      () =>
        createDJSyncJobRuntime({
          deviceId:
            '',

          apiUrl:
            'https://example.com',

          apiKey:
            'test-key',
        }),
      {
        message:
          'SYNC_AGENT_ID is required.',
      },
    );
  },
);

test(
  'job runtime validates required api key',
  () => {
    assert.throws(
      () =>
        createDJSyncJobRuntime({
          deviceId:
            'macbook-air-jorge-1',

          apiUrl:
            'https://example.com',

          apiKey:
            '',
        }),
      {
        message:
          'SYNC_API_KEY is required.',
      },
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