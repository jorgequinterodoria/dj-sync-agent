import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRetryPolicy,
  retryDelayMs,
} from './retry-policy.js';

test('retry policy creates bounded defaults', () => {
  const policy =
    createRetryPolicy();

  assert.equal(
    policy.maxAttempts,
    3,
  );

  assert.equal(
    policy.baseDelayMs,
    250,
  );

  assert.equal(
    policy.maxDelayMs,
    5_000,
  );
});

test('retry delay grows with attempts and stays bounded', () => {
  const policy =
    createRetryPolicy({
      baseDelayMs: 100,
      maxDelayMs: 250,
      jitterRatio: 0,
      backoffMultiplier: 2,
    });

  assert.equal(
    retryDelayMs(
      policy,
      1,
      {
        random: () => 0.5,
      },
    ),
    100,
  );

  assert.equal(
    retryDelayMs(
      policy,
      2,
      {
        random: () => 0.5,
      },
    ),
    200,
  );

  assert.equal(
    retryDelayMs(
      policy,
      4,
      {
        random: () => 0.5,
      },
    ),
    250,
  );
});

test('retry policy rejects invalid configuration', () => {
  assert.throws(
    () =>
      createRetryPolicy({
        maxAttempts: 0,
      }),
    /maxAttempts/i,
  );

  assert.throws(
    () =>
      createRetryPolicy({
        baseDelayMs: 200,
        maxDelayMs: 100,
      }),
    /maxDelayMs/i,
  );
});
