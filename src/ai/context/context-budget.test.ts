import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CONTEXT_BUDGET,
  normalizeContextBudget,
  truncateByBudget,
} from './context-budget.js';

test('context budget normalizes invalid values', () => {
  const budget = normalizeContextBudget({
    maxMessages: 0,
    maxCandidates: -1,
  });

  assert.equal(
    budget.maxMessages,
    DEFAULT_CONTEXT_BUDGET.maxMessages,
  );
  assert.equal(
    budget.maxCandidates,
    DEFAULT_CONTEXT_BUDGET.maxCandidates,
  );
});

test('context budget truncates deterministically', () => {
  assert.deepEqual(
    truncateByBudget(
      ['a', 'b', 'c'],
      2,
    ),
    {
      items: ['a', 'b'],
      truncated: true,
    },
  );
});
