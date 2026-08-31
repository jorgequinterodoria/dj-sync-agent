import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryIdempotencyStore,
  runIdempotently,
} from './idempotency.js';

test('idempotency store reuses completed result', async () => {
  const store =
    new InMemoryIdempotencyStore<number>();

  let executions = 0;

  const first =
    await runIdempotently(
      store,
      'request-1',
      async () => {
        executions += 1;
        return 42;
      },
      () => 100,
    );

  const second =
    await runIdempotently(
      store,
      'request-1',
      async () => {
        executions += 1;
        return 99;
      },
      () => 200,
    );

  assert.deepEqual(
    first,
    {
      value: 42,
      reused: false,
    },
  );

  assert.deepEqual(
    second,
    {
      value: 42,
      reused: true,
    },
  );

  assert.equal(
    executions,
    1,
  );
});

test('idempotency store normalizes keys', () => {
  const store =
    new InMemoryIdempotencyStore<string>();

  store.put({
    key:
      ' request-1 ',
    value:
      'done',
    createdAtMs:
      1,
  });

  assert.equal(
    store.get(
      'request-1',
    )?.value,
    'done',
  );
});
