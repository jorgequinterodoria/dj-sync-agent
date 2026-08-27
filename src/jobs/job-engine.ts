import {
  randomUUID,
} from 'node:crypto';

import type {
  JobRepository,
} from './job-repository.js';

import type {
  JobHandler,
  JobRecord,
  ManagedJobType,
} from './job-types.js';

export interface JobEngineOptions {
  repository:
    JobRepository;

  deviceId:
    string;

  concurrency?:
    number;

  leaseSeconds?:
    number;

  maxAttempts?:
    number;

  retryDelaySeconds?:
    number;
}

export interface JobEngineRunResult {
  claimed:
    number;

  completed:
    number;

  failed:
    number;

  skipped:
    number;
}

export interface JobEngine {
  runOnce():
    Promise<JobEngineRunResult>;

  start():
    Promise<void>;

  stop():
    Promise<void>;

  register(
    jobType:
      ManagedJobType,
    handler:
      JobHandler,
  ):
    void;
}

export function createJobEngine(
  options:
    JobEngineOptions,
):
  JobEngine {
  const deviceId =
    options.deviceId.trim();

  if (
    !deviceId
  ) {
    throw new Error(
      'SYNC_AGENT_ID is required.',
    );
  }

  const concurrency =
    options.concurrency ??
    2;

  const leaseSeconds =
    options.leaseSeconds ??
    120;

  const maxAttempts =
    options.maxAttempts ??
    10;

  const retryDelaySeconds =
    options.retryDelaySeconds ??
    30;

  const workerId =
    `${deviceId}:${randomUUID()}`;

  const handlers =
    new Map<
      ManagedJobType,
      JobHandler
    >();

  let running =
    false;

  let loopPromise:
    Promise<void> | null =
    null;

  function handlerFor(
    jobType:
      string,
  ):
    JobHandler | null {
    return (
      handlers.get(
        jobType as ManagedJobType,
      ) ??
      null
    );
  }

  async function executeJob(
    job:
      JobRecord,
  ):
    Promise<
      'completed' |
      'failed' |
      'skipped'
    > {
    const handler =
      handlerFor(
        job.jobType,
      );

    if (
      handler ===
      null
    ) {
      await options.repository.fail({
        jobId:
          job.id,

        workerId,

        error:
          `No handler registered for job type: ${job.jobType}`,

        retryable:
          false,

        maxAttempts,

        retryDelaySeconds,
      });

      return 'skipped';
    }

    try {
      /*
       * The local handler validates/dispatches the job.
       * The server-side execute RPC owns the atomic
       * projection + completion transaction.
       */
      await handler.execute({
        workerId,

        job,
      });

      await options.repository.execute({
        jobId:
          job.id,

        workerId,
      });

      return 'completed';
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const stale =
        message.includes(
          'stale_job',
        ) ||
        message.includes(
          'stale_intelligence_job:',
        );

      try {
        await options.repository.fail({
          jobId:
            job.id,

          workerId,

          error:
            message,

          retryable:
            !stale,

          maxAttempts,

          retryDelaySeconds,
        });
      } catch {
        /*
         * If the execute transaction already completed
         * the job and returned an unexpected client error,
         * do not mask the original execution result.
         */
      }

      return 'failed';
    }
  }

  async function runOnce():
    Promise<JobEngineRunResult> {
    const jobs =
      await options.repository.claim({
        deviceId,

        workerId,

        limit:
          concurrency,

        leaseSeconds,
      });

    if (
      jobs.length ===
      0
    ) {
      return {
        claimed: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
      };
    }

    const results =
      await Promise.all(
        jobs.map(
          executeJob,
        ),
      );

    return {
      claimed:
        jobs.length,

      completed:
        results.filter(
          (
            result,
          ) =>
            result ===
            'completed',
        ).length,

      failed:
        results.filter(
          (
            result,
          ) =>
            result ===
            'failed',
        ).length,

      skipped:
        results.filter(
          (
            result,
          ) =>
            result ===
            'skipped',
        ).length,
    };
  }

  async function loop():
    Promise<void> {
    while (
      running
    ) {
      try {
        const result =
          await runOnce();

        if (
          result.claimed ===
          0
        ) {
          await new Promise<void>(
            (
              resolve,
            ) => {
              setTimeout(
                resolve,
                1000,
              );
            },
          );
        }
      } catch {
        await new Promise<void>(
          (
            resolve,
          ) => {
            setTimeout(
              resolve,
              2000,
            );
          },
        );
      }
    }
  }

  return {
    register(
      jobType,
      handler,
    ) {
      handlers.set(
        jobType,
        handler,
      );
    },

    runOnce,

    async start() {
      if (
        running
      ) {
        return;
      }

      running =
        true;

      loopPromise =
        loop();
    },

    async stop() {
      if (
        !running
      ) {
        return;
      }

      running =
        false;

      const current =
        loopPromise;

      loopPromise =
        null;

      if (
        current !==
        null
      ) {
        await current;
      }
    },
  };
}