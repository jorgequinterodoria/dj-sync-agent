import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCopilotPlanner,
} from './copilot-planner.js';

test('planner normalizes input and preserves deterministic steps', async () => {
  const planner =
    createCopilotPlanner({
      maxPlanSteps: 3,

      async createPlan(request) {
        assert.equal(
          request.userMessage,
          'find tracks',
        );

        assert.deepEqual(
          request.availableTools,
          [
            'history.get',
            'library.search',
          ],
        );

        return [
          {
            id: 'search',
            tool: 'library.search',
            arguments: { text: 'house' },
            reason: 'Find tracks.',
            risk: 'read',
          },
        ];
      },
    });

  const result =
    await planner.plan({
      userMessage: '  find tracks  ',
      availableTools: [
        'library.search',
        'history.get',
      ],
    });

  assert.equal(
    result.schemaVersion,
    1,
  );

  assert.equal(
    result.steps[0]?.id,
    'search',
  );
});

test('planner enforces plan step limit', async () => {
  const planner =
    createCopilotPlanner({
      maxPlanSteps: 1,

      async createPlan() {
        return [
          {
            id: 'a',
            tool: 'library.search',
            arguments: {},
            reason: 'a',
            risk: 'read',
          },
          {
            id: 'b',
            tool: 'history.get',
            arguments: {},
            reason: 'b',
            risk: 'read',
          },
        ];
      },
    });

  await assert.rejects(
    planner.plan({
      userMessage: 'plan',
      availableTools: [
        'library.search',
        'history.get',
      ],
    }),
    {
      message:
        'Planner step limit exceeded: 1.',
    },
  );
});

test('planner rejects an empty request', async () => {
  const planner =
    createCopilotPlanner({
      async createPlan() {
        return [];
      },
    });

  await assert.rejects(
    planner.plan({
      userMessage: ' ',
      availableTools: [],
    }),
    {
      message:
        'Planner user message is required.',
    },
  );
});
