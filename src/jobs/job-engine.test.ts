import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createJobEngine,
} from './job-engine.js';

import type {
  JobRepository,
} from './job-repository.js';

import type {
  JobHandler,
  JobRecord,
  ManagedJobType,
} from './job-types.js';

function createJob(
  overrides:
    Partial<JobRecord> = {},
): JobRecord {
  return {
    id:
      100,

    jobKey:
      'test-job',

    jobType:
      'track.intelligence.refresh',

    status:
      'pending',

    priority:
      50,

    eventId:
      'event-1',

    deviceId:
      'device-1',

    trackId:
      'track-1',

    rbLocalUsn:
      1000,

    payload: {
      trackHash:
        'hash-1',
    },

    attempts:
      0,

    availableAt:
      '2026-08-27T00:00:00.000Z',

    lockedAt:
      null,

    startedAt:
      null,

    completedAt:
      null,

    lastError:
      null,

    createdAt:
      '2026-08-27T00:00:00.000Z',

    updatedAt:
      '2026-08-27T00:00:00.000Z',

    lockedBy:
      null,

    ...overrides,
  };
}

function createRepository(
  options: {
    jobs?:
      JobRecord[];

    executeError?:
      Error;

    completeAfterExecute?:
      boolean;
  } = {},
) {
  const jobs =
    options.jobs ?? [
      createJob(),
    ];

  const calls = {
    claim: [] as Array<{
      deviceId:
        string;

      workerId:
        string;

      limit:
        number;

      leaseSeconds:
        number;
    }>,

    execute: [] as Array<{
      jobId:
        number;

      workerId:
        string;
    }>,

    fail: [] as Array<{
      jobId:
        number;

      workerId:
        string;

      error:
        string;

      retryable:
        boolean;

      maxAttempts:
        number;

      retryDelaySeconds:
        number;
    }>,
  };

  const repository:
    JobRepository = {
    async claim(
      input,
    ) {
      calls.claim.push(
        input,
      );

      return jobs;
    },

    async execute(
      input,
    ) {
      calls.execute.push(
        input,
      );

      if (
        options.executeError
      ) {
        throw options.executeError;
      }

      return createJob({
        ...(jobs[0] ?? {}),
        id:
          input.jobId,

        status:
          'completed',

        attempts:
          1,

        lockedBy:
          null,
      });
    },

    async fail(
      input,
    ) {
      calls.fail.push(
        input,
      );

      return createJob({
        ...(jobs[0] ?? {}),
        id:
          input.jobId,

        status:
          input.retryable
            ? 'pending'
            : 'failed',

        attempts:
          1,

        lastError:
          input.error,

        lockedBy:
          null,

        lockedAt:
          null,
      });
    },
  };

  return {
    repository,
    calls,
  };
}

function createRefreshHandler(
  options: {
    error?:
      Error;

    executions?:
      JobRecord[];
  } = {},
): JobHandler {
  return {
    async execute(
      context,
    ) {
      options.executions?.push(
        context.job,
      );

      if (
        options.error
      ) {
        throw options.error;
      }

      return {
        completed:
          true,
      };
    },
  };
}

test(
  'job engine claims and executes a managed job',
  async () => {
    const {
      repository,
      calls,
    } =
      createRepository();

    const executions:
      JobRecord[] = [];

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',

        concurrency:
          2,

        leaseSeconds:
          120,

        maxAttempts:
          10,

        retryDelaySeconds:
          30,
      });

    engine.register(
      'track.intelligence.refresh',
      createRefreshHandler({
        executions,
      }),
    );

    const result =
      await engine.runOnce();

    assert.deepEqual(
      result,
      {
        claimed:
          1,

        completed:
          1,

        failed:
          0,

        skipped:
          0,
      },
    );

    assert.equal(
      calls.claim.length,
      1,
    );

    assert.equal(
      calls.execute.length,
      1,
    );

    assert.equal(
      calls.execute[0]?.jobId,
      100,
    );

    assert.equal(
      executions.length,
      1,
    );

    assert.equal(
      calls.fail.length,
      0,
    );
  },
);

test(
  'job engine reports no work when claim returns no jobs',
  async () => {
    const {
      repository,
      calls,
    } =
      createRepository({
        jobs: [],
      });

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',
      });

    const result =
      await engine.runOnce();

    assert.deepEqual(
      result,
      {
        claimed:
          0,

        completed:
          0,

        failed:
          0,

        skipped:
          0,
      },
    );

    assert.equal(
      calls.execute.length,
      0,
    );

    assert.equal(
      calls.fail.length,
      0,
    );
  },
);

test(
  'job engine does not retry a stale job',
  async () => {
    const {
      repository,
      calls,
    } =
      createRepository();

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',

        maxAttempts:
          10,

        retryDelaySeconds:
          30,
      });

    engine.register(
      'track.intelligence.refresh',
      createRefreshHandler(),
    );

    calls.execute.length = 0;

    const originalExecute =
      repository.execute;

    repository.execute =
      async (
        input,
      ) => {
        calls.execute.push(
          input,
        );

        throw new Error(
          'stale_intelligence_job:OLD_HASH:NEW_HASH',
        );
      };

    const result =
      await engine.runOnce();

    assert.deepEqual(
      result,
      {
        claimed:
          1,

        completed:
          0,

        failed:
          1,

        skipped:
          0,
      },
    );

    assert.equal(
      calls.execute.length,
      1,
    );

    assert.equal(
      calls.fail.length,
      1,
    );

    assert.equal(
      calls.fail[0]?.retryable,
      false,
    );

    assert.match(
      calls.fail[0]?.error ??
        '',
      /stale_intelligence_job/,
    );

    repository.execute =
      originalExecute;
  },
);

test(
  'job engine retries normal execution failures',
  async () => {
    const {
      repository,
      calls,
    } =
      createRepository();

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',

        maxAttempts:
          10,

        retryDelaySeconds:
          30,
      });

    engine.register(
      'track.intelligence.refresh',
      createRefreshHandler({
        error:
          new Error(
            'temporary infrastructure failure',
          ),
      }),
    );

    const result =
      await engine.runOnce();

    assert.deepEqual(
      result,
      {
        claimed:
          1,

        completed:
          0,

        failed:
          1,

        skipped:
          0,
      },
    );

    assert.equal(
      calls.execute.length,
      0,
    );

    assert.equal(
      calls.fail.length,
      1,
    );

    assert.equal(
      calls.fail[0]?.retryable,
      true,
    );

    assert.equal(
      calls.fail[0]?.maxAttempts,
      10,
    );

    assert.equal(
      calls.fail[0]?.retryDelaySeconds,
      30,
    );
  },
);

test(
  'job engine skips unknown job types without executing them',
  async () => {
    const {
      repository,
      calls,
    } =
      createRepository({
        jobs: [
          createJob({
            jobType:
              'track.unknown.test',
          }),
        ],
      });

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',
      });

    engine.register(
      'track.intelligence.refresh',
      createRefreshHandler(),
    );

    const result =
      await engine.runOnce();

    assert.deepEqual(
      result,
      {
        claimed:
          1,

        completed:
          0,

        failed:
          0,

        skipped:
          1,
      },
    );

    assert.equal(
      calls.execute.length,
      0,
    );

    assert.equal(
      calls.fail.length,
      1,
    );

    assert.equal(
      calls.fail[0]?.retryable,
      false,
    );

    assert.match(
      calls.fail[0]?.error ??
        '',
      /No handler registered/,
    );
  },
);

test(
  'job engine forwards concurrency to claim',
  async () => {
    const {
      repository,
      calls,
    } =
      createRepository({
        jobs: [
          createJob({
            id:
              101,
          }),

          createJob({
            id:
              102,
          }),
        ],
      });

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',

        concurrency:
          2,

        leaseSeconds:
          180,
      });

    engine.register(
      'track.intelligence.refresh',
      createRefreshHandler(),
    );

    await engine.runOnce();

    assert.equal(
      calls.claim[0]?.limit,
      2,
    );

    assert.equal(
      calls.claim[0]?.leaseSeconds,
      180,
    );
  },
);

test(
  'job engine requires a device id',
  () => {
    const {
      repository,
    } =
      createRepository();

    assert.throws(
      () =>
        createJobEngine({
          repository,

          deviceId:
            '   ',
        }),
      {
        message:
          'SYNC_AGENT_ID is required.',
      },
    );
  },
);

test(
  'job engine start is idempotent',
  async () => {
    const {
      repository,
      calls,
    } =
      createRepository({
        jobs: [],
      });

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',
      });

    await engine.start();
    await engine.start();

    await new Promise(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          25,
        );
      },
    );

    await engine.stop();
    await engine.stop();

    assert.ok(
      calls.claim.length >=
        1,
    );
  },
);

test(
  'job engine handler registration is limited to managed types',
  () => {
    const registered:
      ManagedJobType[] = [];

    const {
      repository,
    } =
      createRepository();

    const engine =
      createJobEngine({
        repository,

        deviceId:
          'device-1',
      });

    const handler =
      createRefreshHandler();

    engine.register(
      'track.intelligence.refresh',
      handler,
    );

    registered.push(
      'track.intelligence.refresh',
    );

    assert.deepEqual(
      registered,
      [
        'track.intelligence.refresh',
      ],
    );
  },
);