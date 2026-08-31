import assert from 'node:assert/strict';
import test from 'node:test';
import { runDJSyncAutonomousCopilot } from './dj-sync-autonomous-copilot.js';

test('runtime wrapper executes the autonomous copilot boundary', async () => {
  const result = await runDJSyncAutonomousCopilot(
    {
      contextProvider: {
        async build() {
          return {
            schemaVersion: 1,
            request: { userMessage: 'read' },
            conversation: {
              summary: null,
              recentMessages: [],
              constraints: [],
            },
            track: null,
            library: { candidates: [] },
            history: { recentPlays: [] },
            intelligence: {},
            personalization: {},
            semantic: { results: [] },
            truncated: [],
            estimatedChars: 1,
          };
        },
      },
      planner: {
        async plan() {
          return {
            schemaVersion: 1,
            requiresApproval: false,
            steps: [],
          };
        },
      },
      reads: { async execute() { return null; } },
      actionMapper: { validate() { throw new Error('unused'); } },
      actions: {
        prepare() { throw new Error('unused'); },
        approve() { throw new Error('unused'); },
        reject() { throw new Error('unused'); },
        async execute() { throw new Error('unused'); },
      },
    },
    {
      requestId: 'runtime-1',
      deviceId: 'device-1',
      userMessage: 'read',
    },
  );

  assert.equal(result.status, 'completed');
});
