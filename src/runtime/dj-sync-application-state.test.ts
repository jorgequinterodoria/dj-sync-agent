import {
  test,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  createDJSyncApplicationState,
} from './dj-sync-application-state.js';

type ServiceStatus =
  Awaited<
    ReturnType<
      Parameters<
        typeof createDJSyncApplicationState
      >[0]['status']
    >
  >;

function createServiceStub() {
  let status: ServiceStatus = {
    schemaVersion: 5,
    generatedAt:
      '2026-01-01T00:00:00.000Z',

    service: {
      label:
        'com.dj-sync-agent.sync-watch',

      loaded: true,

      state:
        'stopped',

      pid: null,
    },

    database: {
      path: '/tmp/master.db',
      exists: true,
    },

    sync: {
      mode:
        'watch',

      status:
        'completed',

      sessionId: null,

      cursor: {
        rbLocalUsn: 123,
        id: 'track-1',
      },

      totals: {
        runs: 1,
        batchesProcessed: 2,
        scanned: 10,
        processed: 10,
      },

      lastRun: null,
    },

    server: {
      apiUrl:
        'https://example.com',

      configured: true,
      reachable: true,
      healthy: true,

      latencyMs: 100,

      version: '1.0.0',
      region: 'test',
      deploymentId: 'test',

      error: null,
    },
  };

  return {
    status: async () =>
      status,

    start: async () => {
      status = {
        ...status,

        service: {
          ...status.service,

          state:
            'running',

          pid: 123,
        },
      };

      return status;
    },

    stop: async () => {
      status = {
        ...status,

        service: {
          ...status.service,

          state:
            'stopped',

          pid: null,
        },
      };

      return status;
    },

    restart: async () => {
      status = {
        ...status,

        service: {
          ...status.service,

          state:
            'running',

          pid: 456,
        },
      };

      return status;
    },
  };
}

test(
  'application state refreshes from the service',
  async () => {
    const service =
      createServiceStub();

    const state =
      createDJSyncApplicationState(
        service,
      );

    const snapshot =
      await state.refresh();

    assert.equal(
      snapshot.schemaVersion,
      1,
    );

    assert.equal(
      snapshot.service.service.state,
      'stopped',
    );

    assert.equal(
      snapshot.service.database.exists,
      true,
    );

    assert.equal(
      snapshot.service.server.healthy,
      true,
    );
  },
);

test(
  'application state emits updates',
  async () => {
    const service =
      createServiceStub();

    const state =
      createDJSyncApplicationState(
        service,
      );

    const snapshots: string[] = [];

    const unsubscribe =
      state.subscribe(
        (snapshot) => {
          snapshots.push(
            snapshot.service
              .service.state,
          );
        },
      );

    await state.start();

    unsubscribe();

    assert.deepEqual(
      snapshots,
      ['running'],
    );
  },
);

test(
  'application state delegates lifecycle actions',
  async () => {
    const service =
      createServiceStub();

    const state =
      createDJSyncApplicationState(
        service,
      );

    const started =
      await state.start();

    assert.equal(
      started.service.service.state,
      'running',
    );

    const stopped =
      await state.stop();

    assert.equal(
      stopped.service.service.state,
      'stopped',
    );

    const restarted =
      await state.restart();

    assert.equal(
      restarted.service.service.state,
      'running',
    );
  },
);