import assert from 'node:assert/strict';
import test from 'node:test';

import { createDJSyncApplicationState } from './dj-sync-application-state.js';
import type {
  DJSyncRuntime,
  DJSyncRuntimeSnapshot,
} from './dj-sync-runtime.js';

function createServiceStub() {
  const status = {
    schemaVersion: 5 as const,
    generatedAt: '2026-08-27T00:00:00.000Z',

    service: {
      label: 'com.dj-sync-agent.sync-watch',
      loaded: false,
      state: 'stopped' as const,
      pid: null,
    },

    database: {
      path: '/tmp/master.db',
      exists: true,
    },

    sync: {
      mode: 'watch' as const,
      status: 'completed' as const,
      sessionId: null,
      cursor: null,

      totals: {
        runs: 0,
        batchesProcessed: 0,
        scanned: 0,
        processed: 0,
      },

      lastRun: null,
    },

    server: {
      apiUrl: 'https://example.com',
      configured: true,
      reachable: true,
      healthy: true,
      latencyMs: 20,
      version: 'test',
      region: null,
      deploymentId: null,
      error: null,
    },
  };

  return {
    async status() {
      return status;
    },

    async start() {
      return status;
    },

    async stop() {
      return status;
    },

    async restart() {
      return status;
    },
  };
}

function createRuntimeStub() {
  let current: DJSyncRuntimeSnapshot = {
    schemaVersion: 2 as const,

    status: 'stopped' as const,

    startedAt: null,

    lastRun: null,

    lastError: null,

    jobs: {
      configured: false,

      status: 'disabled' as const,

      workerId: null,

      startedAt: null,

      lastRunAt: null,

      lastRun: null,

      lastError: null,

      totals: {
        claimed: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
      },
    },
  };

  const listeners = new Set<
    (value: typeof current) => void
  >();

  const emit = () => {
    listeners.forEach(
      (listener) => {
        listener(current);
      },
    );
  };

  return {
    runtime: {
      async start() {
        current = {
          ...current,

          status:
            'running',

          startedAt:
            new Date().toISOString(),
        };

        emit();

        return current;
      },

      async stop() {
        current = {
          ...current,

          status:
            'stopped',
        };

        emit();

        return current;
      },

      status() {
        return current;
      },

      subscribe(
        listener: (
          value: typeof current,
        ) => void,
      ) {
        listeners.add(
          listener,
        );

        return () =>
          listeners.delete(
            listener,
          );
      },
    } satisfies DJSyncRuntime,
  };
}

test(
  'application state exposes runtime state',
  async () => {
    const runtime =
      createRuntimeStub();

    const state =
      createDJSyncApplicationState(
        createServiceStub(),
        runtime.runtime,
      );

    const snapshot =
      await state.refresh();

    assert.equal(
      snapshot.schemaVersion,
      2,
    );

    assert.equal(
      snapshot.runtime.status,
      'stopped',
    );
  },
);

test(
  'application start controls autonomous runtime',
  async () => {
    const runtime =
      createRuntimeStub();

    const state =
      createDJSyncApplicationState(
        createServiceStub(),
        runtime.runtime,
      );

    const snapshot =
      await state.start();

    assert.equal(
      snapshot.runtime.status,
      'running',
    );
  },
);

test(
  'application stop controls autonomous runtime',
  async () => {
    const runtime =
      createRuntimeStub();

    const state =
      createDJSyncApplicationState(
        createServiceStub(),
        runtime.runtime,
      );

    await state.start();

    const snapshot =
      await state.stop();

    assert.equal(
      snapshot.runtime.status,
      'stopped',
    );
  },
);

test(
  'application runtime updates are emitted',
  async () => {
    const runtime =
      createRuntimeStub();

    const state =
      createDJSyncApplicationState(
        createServiceStub(),
        runtime.runtime,
      );

    const statuses: string[] =
      [];

    const unsubscribe =
      state.subscribe(
        (snapshot) => {
          statuses.push(
            snapshot.runtime.status,
          );
        },
      );

    await state.start();

    unsubscribe();

    assert.ok(
      statuses.includes(
        'running',
      ),
    );
  },
);