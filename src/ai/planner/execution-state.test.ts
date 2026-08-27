import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExecutionState,
} from './execution-state.js';

test('execution state preserves completed predecessor results', () => {
  const state =
    new ExecutionState(
      () => '2026-08-27T00:00:00Z',
    );

  state.start('search');
  state.complete(
    'search',
    { items: ['a'] },
  );

  state.start('recommend');
  state.fail(
    'recommend',
    'No compatible tracks.',
  );

  const snapshot =
    state.snapshot();

  assert.equal(
    snapshot.steps[0]?.status,
    'completed',
  );

  assert.deepEqual(
    snapshot.steps[0]?.result,
    { items: ['a'] },
  );

  assert.equal(
    snapshot.steps[1]?.status,
    'failed',
  );
});

test('execution state increments attempts', () => {
  const state =
    new ExecutionState(
      () => '2026-08-27T00:00:00Z',
    );

  state.start('search');
  state.fail(
    'search',
    'temporary',
  );

  state.start('search');

  assert.equal(
    state.get('search')?.attempts,
    2,
  );
});
