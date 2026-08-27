import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runWithRetry,
} from './operation-runner.js';

test('operation runner retries transient failures', async () => {
  let attempts = 0;
  let sleeps = 0;

  const result =
    await runWithRetry(
      async () => {
        attempts += 1;

        if (
          attempts < 3
        ) {
          throw new Error(
            'temporary',
          );
        }

        return 'ok';
      },
      {
        retry: {
          maxAttempts: 3,
          baseDelayMs: 1,
          maxDelayMs: 1,
          jitterRatio: 0,
        },
        sleep: async () => {
          sleeps += 1;
        },
      },
    );

  assert.equal(
    result.value,
    'ok',
  );

  assert.equal(
    result.attempts,
    3,
  );

  assert.equal(
    sleeps,
    2,
  );
});

test('operation runner does not retry non-retryable failures', async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      runWithRetry(
        async () => {
          attempts += 1;
          throw new Error(
            'fatal',
          );
        },
        {
          retry: {
            maxAttempts: 5,
          },
          isRetryable:
            () => false,
          sleep:
            async () => {},
        },
      ),
    /fatal/,
  );

  assert.equal(
    attempts,
    1,
  );
});

test('operation runner returns attempt count', async () => {
  const result =
    await runWithRetry(
      async (attempt) =>
        attempt === 1
          ? Promise.reject(
              new Error(
                'retry',
              ),
            )
          : Promise.resolve(
              42,
            ),
      {
        retry: {
          maxAttempts: 2,
          baseDelayMs: 1,
          maxDelayMs: 1,
          jitterRatio: 0,
        },
        sleep:
          async () => {},
      },
    );

  assert.deepEqual(
    result,
    {
      value: 42,
      attempts: 2,
    },
  );
});
