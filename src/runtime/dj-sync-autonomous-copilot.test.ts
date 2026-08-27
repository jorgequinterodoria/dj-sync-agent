import assert from 'node:assert/strict';
import test from 'node:test';

import { createDJSyncAutonomousCopilot } from './dj-sync-autonomous-copilot.js';

test('autonomous copilot runs and exposes cycle state', async () => {
  const copilot = createDJSyncAutonomousCopilot({
    deviceId: 'device-1',
    executors: {
      intelligence: async () => ({ ready: true }),
      reasoning: async () => ({ decision: 'recommend' }),
      action: async () => ({ executed: true }),
    },
  });

  await copilot.start();

  const result = await copilot.run({
    deviceId: 'ignored-by-adapter',
    trackId: 'track-1',
    trigger: 'manual',
    requestedAt: new Date().toISOString(),
  });

  assert.equal(result.completed, true);
  assert.equal(copilot.snapshot().status, 'idle');
  assert.equal(copilot.snapshot().lastCycle?.completed, true);
});

test('autonomous copilot records failed cycles', async () => {
  const copilot = createDJSyncAutonomousCopilot({
    deviceId: 'device-1',
    executors: {
      intelligence: async () => { throw new Error('intelligence unavailable'); },
    },
  });

  const result = await copilot.run({
    deviceId: 'device-1',
    trigger: 'sync_change',
    requestedAt: new Date().toISOString(),
  });

  assert.equal(result.completed, false);
  assert.equal(copilot.snapshot().status, 'failed');
  assert.equal(copilot.snapshot().lastError, 'intelligence unavailable');
});

test('autonomous copilot requires a device id', () => {
  assert.throws(
    () => createDJSyncAutonomousCopilot({
      deviceId: '   ',
      executors: {},
    }),
    /requires a device id/,
  );
});
