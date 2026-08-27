import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CircuitBreaker,
} from './circuit-breaker.js';

test('circuit breaker opens after threshold failures', () => {
  let now = 0;

  const breaker =
    new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
      now: () => now,
    });

  breaker.recordFailure();

  assert.equal(
    breaker.state,
    'closed',
  );

  breaker.recordFailure();

  assert.equal(
    breaker.state,
    'open',
  );

  assert.equal(
    breaker.allowRequest(),
    false,
  );
});

test('circuit breaker enters half-open after reset timeout', () => {
  let now = 0;

  const breaker =
    new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });

  breaker.recordFailure();

  now = 999;

  assert.equal(
    breaker.allowRequest(),
    false,
  );

  now = 1000;

  assert.equal(
    breaker.state,
    'half-open',
  );

  assert.equal(
    breaker.allowRequest(),
    true,
  );

  breaker.recordSuccess();

  assert.equal(
    breaker.state,
    'closed',
  );
});

test('circuit breaker closes after successful execute', async () => {
  const breaker =
    new CircuitBreaker({
      failureThreshold: 2,
    });

  const result =
    await breaker.execute(
      async () =>
        'ok',
    );

  assert.equal(
    result,
    'ok',
  );

  assert.equal(
    breaker.state,
    'closed',
  );
});
