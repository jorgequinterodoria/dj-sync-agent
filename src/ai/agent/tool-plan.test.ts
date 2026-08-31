import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createToolPlan,
} from './tool-plan.js';

test('tool plan preserves deterministic order', () => {
  const plan = createToolPlan([
    {
      id: 'search',
      tool: 'library.search',
      arguments: { text: 'house' },
      reason: 'Find candidates.',
      dependsOn: [],
      risk: 'read',
    },
    {
      id: 'history',
      tool: 'history.get',
      arguments: {},
      reason: 'Check recent plays.',
      dependsOn: ['search'],
      risk: 'read',
    },
  ]);

  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['search', 'history'],
  );

  assert.equal(
    plan.requiresApproval,
    false,
  );
});

test('tool plan marks write and review plans', () => {
  const plan = createToolPlan([
    {
      id: 'modify',
      tool: 'playlist.modify',
      arguments: {},
      reason: 'Apply user-approved change.',
      dependsOn: [],
      risk: 'review',
    },
  ]);

  assert.equal(
    plan.requiresApproval,
    true,
  );
});

test('tool plan rejects forward dependencies', () => {
  assert.throws(
    () =>
      createToolPlan([
        {
          id: 'second',
          tool: 'history.get',
          arguments: {},
          reason: 'invalid',
          dependsOn: ['first'],
          risk: 'read',
        },
        {
          id: 'first',
          tool: 'library.search',
          arguments: {},
          reason: 'search',
          dependsOn: [],
          risk: 'read',
        },
      ]),
    {
      message:
        'Tool plan dependency must reference a previous step: first',
    },
  );
});
