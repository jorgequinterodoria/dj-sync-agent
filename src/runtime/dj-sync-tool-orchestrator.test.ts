import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import {
  createToolRegistry,
} from '../ai/tools/tool-registry.js';

import {
  ToolSelectionPolicy,
} from '../ai/agent/tool-selection-policy.js';

import {
  createToolPlan,
} from '../ai/agent/tool-plan.js';

import {
  DJSyncToolOrchestrator,
} from './dj-sync-tool-orchestrator.js';

function createRegistry() {
  const registry =
    createToolRegistry();

  let executions = 0;

  registry.register({
    name: 'library.search',
    description: 'Search library.',
    risk: 'read',
    inputSchema: z.object({
      text: z.string(),
    }),
    timeoutMs: 1_000,
    execute: async (input) => {
      executions += 1;
      return {
        items: [input.text],
        executions,
      };
    },
  });

  return registry;
}

test('tool orchestrator executes allowed plan steps', async () => {
  const registry =
    createRegistry();

  const orchestrator =
    new DJSyncToolOrchestrator({
      registry,
      policy:
        new ToolSelectionPolicy([
          {
            name: 'library.search',
            risk: 'read',
          },
        ]),
      toolContext: {
        deviceId: 'device-1',
        requestId: 'request-1',
        now: () => '2026-08-27T00:00:00Z',
      },
    });

  const plan = createToolPlan([
    {
      id: 'search',
      tool: 'library.search',
      arguments: { text: 'house' },
      reason: 'Find house tracks.',
      dependsOn: [],
      risk: 'read',
    },
  ]);

  const result =
    await orchestrator.executePlan(
      plan,
    );

  assert.equal(
    result.completed.length,
    1,
  );

  assert.equal(
    result.completed[0]?.cached,
    false,
  );
});

test('tool orchestrator caches identical calls during a cycle', async () => {
  const registry =
    createRegistry();

  const orchestrator =
    new DJSyncToolOrchestrator({
      registry,
      policy:
        new ToolSelectionPolicy([
          {
            name: 'library.search',
            risk: 'read',
          },
        ]),
      toolContext: {
        deviceId: 'device-1',
        requestId: 'request-1',
        now: () => '2026-08-27T00:00:00Z',
      },
    });

  const step = {
    id: 'search',
    tool: 'library.search',
    arguments: { text: 'house' },
    reason: 'Find tracks.',
    dependsOn: [],
    risk: 'read' as const,
  };

  await orchestrator.executePlan(
    createToolPlan([step]),
  );

  const second =
    await orchestrator.executePlan(
      createToolPlan([
        {
          ...step,
          id: 'search-again',
        },
      ]),
    );

  assert.equal(
    second.completed[0]?.cached,
    true,
  );
});

test('tool orchestrator blocks write tools without policy approval', async () => {
  const registry =
    createRegistry();

  const orchestrator =
    new DJSyncToolOrchestrator({
      registry,
      policy:
        new ToolSelectionPolicy([]),
      toolContext: {
        deviceId: 'device-1',
        requestId: 'request-1',
        now: () => '2026-08-27T00:00:00Z',
      },
    });

  const result =
    await orchestrator.executePlan(
      createToolPlan([
        {
          id: 'write',
          tool: 'actions.execute',
          arguments: {},
          reason: 'change something',
          dependsOn: [],
          risk: 'write',
        },
      ]),
    );

  assert.equal(
    result.completed.length,
    0,
  );

  assert.equal(
    result.blocked.length,
    1,
  );
});
