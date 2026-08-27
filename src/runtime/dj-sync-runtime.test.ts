import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncRuntime,
  type DJSyncRuntimeLastRun,
} from './dj-sync-runtime.js';
import type { DJSyncJobRuntime, DJSyncJobRuntimeSnapshot } from './dj-sync-job-runtime.js';

function createJobRuntimeStub() {
  let state: DJSyncJobRuntimeSnapshot = {
    configured: true,
    status: 'stopped' as const,
    workerId: 'worker-1',
    startedAt: null as string | null,
    lastRunAt: null as string | null,
    lastRun: null,
    lastError: null,
    totals: {
      claimed: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    },
  };

  const listeners = new Set<(snapshot: typeof state) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    runtime: {
      async start() {
        state = {
          ...state,
          status: 'running',
          startedAt: new Date().toISOString(),
        };
        emit();
      },
      async stop() {
        state = {
          ...state,
          status: 'stopped',
        };
        emit();
      },
      async runOnce() {
        return {
          claimed: 0,
          completed: 0,
          failed: 0,
          skipped: 0,
        };
      },
      snapshot() {
        return state;
      },
      subscribe(listener: (snapshot: typeof state) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } satisfies DJSyncJobRuntime,
  };
}

const fakeRun = (): DJSyncRuntimeLastRun => ({
  schemaVersion: 1,
  startedAt: '2026-08-27T00:00:00.000Z',
  finishedAt: '2026-08-27T00:00:01.000Z',
  elapsedMs: 1000,
  batchesProcessed: 1,
  scanned: 10,
  processed: 10,
  completed: true,
  finalCursor: {
    rbLocalUsn: 123,
    id: 'track-1',
  },
});

test('runtime starts sync and job worker together', async () => {
  let syncStarted = 0;
  let syncClosed = 0;

  const job = createJobRuntimeStub();

  const runtime = createDJSyncRuntime({
    jobRuntime: job.runtime,
    startSyncWatch: async (onRun) => {
      syncStarted += 1;
      onRun(fakeRun());
      return {
        async close() {
          syncClosed += 1;
        },
      };
    },
  });

  const started = await runtime.start();

  assert.equal(started.status, 'running');
  assert.equal(started.jobs.status, 'running');
  assert.equal(syncStarted, 1);
  assert.equal(started.lastRun?.processed, 10);

  const stopped = await runtime.stop();

  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.jobs.status, 'stopped');
  assert.equal(syncClosed, 1);
});

test('runtime start is idempotent', async () => {
  let starts = 0;

  const runtime = createDJSyncRuntime({
    startSyncWatch: async () => {
      starts += 1;
      return { async close() {} };
    },
  });

  await runtime.start();
  await runtime.start();
  await runtime.stop();

  assert.equal(starts, 1);
});

test('runtime propagates sync startup failure and returns to stopped', async () => {
  const runtime = createDJSyncRuntime({
    startSyncWatch: async () => {
      throw new Error('rekordbox unavailable');
    },
  });

  await assert.rejects(
    runtime.start(),
    /rekordbox unavailable/,
  );

  assert.equal(runtime.status().status, 'stopped');
  assert.equal(runtime.status().lastError, 'rekordbox unavailable');
});

test('runtime stops both components when shutdown is requested', async () => {
  const events: string[] = [];
  const job = createJobRuntimeStub();

  const runtime = createDJSyncRuntime({
    jobRuntime: job.runtime,
    startSyncWatch: async () => {
      events.push('sync:start');
      return {
        async close() {
          events.push('sync:stop');
        },
      };
    },
  });

  await runtime.start();
  await runtime.stop();

  assert.deepEqual(events, ['sync:start', 'sync:stop']);
});
