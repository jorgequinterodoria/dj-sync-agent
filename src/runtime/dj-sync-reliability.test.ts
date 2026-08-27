import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncReliability,
} from './dj-sync-reliability.js';

test('runtime reliability combines retry, circuit and bounded concurrency', async () => {
  const reliability =
    createDJSyncReliability({
      retry: {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitterRatio: 0,
      },
      circuitFailureThreshold: 2,
      concurrency: 2,
    });

  let attempts = 0;

  const result =
    await reliability.run(
      async () => {
        attempts += 1;

        if (
          attempts === 1
        ) {
          throw new Error(
            'transient',
          );
        }

        return 'ok';
      },
    );

  assert.equal(
    result.value,
    'ok',
  );

  assert.equal(
    result.attempts,
    2,
  );

  const mapped =
    await reliability.map(
      [1, 2, 3],
      async (value) =>
        value * 10,
    );

  assert.deepEqual(
    mapped,
    [10, 20, 30],
  );
});
