import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import {
  createToolRegistry,
} from '../ai/tools/tool-registry.js';

import {
  createToolPlan,
} from '../ai/agent/tool-plan.js';

import {
  DJSyncCopilotPlanner,
} from './dj-sync-copilot-planner.js';

function createRegistry(
  options: {
    readonly failHistory?: boolean;
    readonly failSearch?: boolean;
  } = {},
) {
  const registry =
    createToolRegistry();

  let searchExecutions = 0;
  let historyExecutions = 0;

  registry.register({
    name: 'library.search',
    description: 'Search the library.',
    risk: 'read',

    inputSchema:
      z.object({
        text: z.string(),
      }),

    timeoutMs: 1_000,

    execute: async (input) => {
      searchExecutions += 1;

      if (options.failSearch) {
        throw new Error(
          'search failed',
        );
      }

      return {
        items: [input.text],
        executions:
          searchExecutions,
      };
    },
  });

  registry.register({
    name: 'history.get',
    description: 'Read playback history.',
    risk: 'read',

    inputSchema:
      z.object({}),

    timeoutMs: 1_000,

    execute: async () => {
      historyExecutions += 1;

      if (options.failHistory) {
        throw new Error(
          'temporary history failure',
        );
      }

      return {
        recent: [],
        executions:
          historyExecutions,
      };
    },
  });

  return {
    registry,

    getSearchExecutions: () =>
      searchExecutions,

    getHistoryExecutions: () =>
      historyExecutions,
  };
}

test(
  'planner executes multiple dependent steps',
  async () => {
    const {
      registry,
      getSearchExecutions,
      getHistoryExecutions,
    } = createRegistry();

    const planner =
      new DJSyncCopilotPlanner({
        registry,

        toolContext: {
          deviceId: 'device-1',
          requestId: 'request-1',
          now: () =>
            '2026-08-27T00:00:00Z',
        },
      });

    const plan =
      createToolPlan([
        {
          id: 'search',
          tool: 'library.search',
          arguments: {
            text: 'house',
          },
          reason:
            'Find candidate tracks.',
          dependsOn: [],
          risk: 'read',
        },

        {
          id: 'history',
          tool: 'history.get',
          arguments: {},
          reason:
            'Check recent playback.',
          dependsOn: ['search'],
          risk: 'read',
        },
      ]);

    const result =
      await planner.execute(
        plan,
      );

    assert.equal(
      getSearchExecutions(),
      1,
    );

    assert.equal(
      getHistoryExecutions(),
      1,
    );

    assert.equal(
      result.results.length,
      2,
    );

    assert.equal(
      result.results[0]?.step.id,
      'search',
    );

    assert.equal(
      result.results[1]?.step.id,
      'history',
    );

    assert.equal(
      result.state.steps[0]?.stepId,
      'search',
    );

    assert.equal(
      result.state.steps[0]?.status,
      'completed',
    );

    assert.deepEqual(
      result.state.steps[0]?.result,
      {
        ok: true,
        tool: 'library.search',
        requestId: 'request-1',
        result: {
          items: ['house'],
          executions: 1,
        },
      },
    );

    assert.equal(
      result.state.steps[1]?.stepId,
      'history',
    );

    assert.equal(
      result.state.steps[1]?.status,
      'completed',
    );

    assert.deepEqual(
      result.state.steps[1]?.result,
      {
        ok: true,
        tool: 'history.get',
        requestId: 'request-1',
        result: {
          recent: [],
          executions: 1,
        },
      },
    );
  },
);

test(
  'planner preserves completed results across replanning',
  async () => {
    const {
      registry,
      getSearchExecutions,
      getHistoryExecutions,
    } = createRegistry({
      failHistory: true,
    });

    const planner =
      new DJSyncCopilotPlanner({
        registry,

        toolContext: {
          deviceId: 'device-1',
          requestId: 'request-1',
          now: () =>
            '2026-08-27T00:00:00Z',
        },

        maxReplans: 1,
      });

    const plan =
      createToolPlan([
        {
          id: 'search',
          tool: 'library.search',
          arguments: {
            text: 'house',
          },
          reason:
            'Find candidate tracks.',
          dependsOn: [],
          risk: 'read',
        },

        {
          id: 'history',
          tool: 'history.get',
          arguments: {},
          reason:
            'Check recent playback.',
          dependsOn: ['search'],
          risk: 'read',
        },
      ]);

    let replanCalls = 0;

    const result =
      await planner.execute(
        plan,
        {
          async replan(request) {
            replanCalls += 1;

            assert.equal(
              request.failedStep.id,
              'history',
            );

            assert.match(
              request.error,
              /temporary history failure/i,
            );

            assert.equal(
              request.completed.length,
              1,
            );

            assert.equal(
              request.completed[0]?.step.id,
              'search',
            );

            return createToolPlan([
              {
                id: 'search',
                tool: 'library.search',
                arguments: {
                  text: 'house',
                },
                reason:
                  'Reuse the completed search result.',
                dependsOn: [],
                risk: 'read',
              },
            ]);
          },
        },
      );

    /*
     * The search step was completed before the
     * history step failed. Replanning must not
     * execute search a second time.
     */
    assert.equal(
      getSearchExecutions(),
      1,
    );

    assert.equal(
      getHistoryExecutions(),
      1,
    );

    assert.equal(
      replanCalls,
      1,
    );

    assert.equal(
      result.replans,
      1,
    );

    assert.equal(
      result.results.length,
      1,
    );

    assert.equal(
      result.results[0]?.step.id,
      'search',
    );

    assert.equal(
      result.state.steps[0]?.stepId,
      'search',
    );

    assert.equal(
      result.state.steps[0]?.status,
      'completed',
    );

    assert.deepEqual(
      result.state.steps[0]?.result,
      {
        ok: true,
        tool: 'library.search',
        requestId: 'request-1',
        result: {
          items: ['house'],
          executions: 1,
        },
      },
    );
  },
);

test(
  'planner stops at an unrecoverable step failure',
  async () => {
    const {
      registry,
      getSearchExecutions,
      getHistoryExecutions,
    } = createRegistry({
      failSearch: true,
    });

    const planner =
      new DJSyncCopilotPlanner({
        registry,

        toolContext: {
          deviceId: 'device-1',
          requestId: 'request-1',
          now: () =>
            '2026-08-27T00:00:00Z',
        },
      });

    const plan =
      createToolPlan([
        {
          id: 'search',
          tool: 'library.search',
          arguments: {
            text: 'house',
          },
          reason:
            'Search candidates.',
          dependsOn: [],
          risk: 'read',
        },

        {
          id: 'history',
          tool: 'history.get',
          arguments: {},
          reason:
            'Read related history.',
          dependsOn: ['search'],
          risk: 'read',
        },
      ]);

    const result =
      await planner.execute(
        plan,
      );

    assert.equal(
      getSearchExecutions(),
      1,
    );

    assert.equal(
      getHistoryExecutions(),
      0,
    );

    assert.equal(
      result.results.length,
      0,
    );

    assert.equal(
      result.state.steps.length,
      1,
    );

    assert.equal(
      result.state.steps[0]?.stepId,
      'search',
    );

    assert.equal(
      result.state.steps[0]?.status,
      'failed',
    );

    assert.match(
      result.state.steps[0]?.error ?? '',
      /search failed/i,
    );
  },
);