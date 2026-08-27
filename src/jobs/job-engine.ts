import { randomUUID } from 'node:crypto';

import type { JobRepository } from './job-repository.js';
import type {
  JobEngineRunResult,
  JobEngineSnapshot,
  JobEngineStatus,
  JobHandler,
  JobRecord,
  ManagedJobType,
} from './job-types.js';

export interface JobEngineOptions {
  repository: JobRepository;
  deviceId: string;
  concurrency?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  retryDelaySeconds?: number;
}

export interface JobEngine {
  runOnce(): Promise<JobEngineRunResult>;
  start(): Promise<void>;
  stop(): Promise<void>;
  snapshot(): JobEngineSnapshot;
  subscribe(
    listener: (snapshot: JobEngineSnapshot) => void,
  ): () => void;
  register(
    jobType: ManagedJobType,
    handler: JobHandler,
  ): void;
}

export function createJobEngine(
  options: JobEngineOptions,
): JobEngine {
  const deviceId = options.deviceId.trim();

  if (!deviceId) {
    throw new Error('SYNC_AGENT_ID is required.');
  }

  const concurrency = options.concurrency ?? 2;
  const leaseSeconds = options.leaseSeconds ?? 120;
  const maxAttempts = options.maxAttempts ?? 10;
  const retryDelaySeconds = options.retryDelaySeconds ?? 30;
  const workerId = `${deviceId}:${randomUUID()}`;

  const handlers = new Map<ManagedJobType, JobHandler>();
  const listeners = new Set<
    (snapshot: JobEngineSnapshot) => void
  >();

  let status: JobEngineStatus = 'stopped';
  let startedAt: string | null = null;
  let lastRunAt: string | null = null;
  let lastRun: JobEngineRunResult | null = null;
  let lastError: string | null = null;
  let totals = {
    claimed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
  let loopPromise: Promise<void> | null = null;
  let running = false;

  const snapshot = (): JobEngineSnapshot => ({
    status,
    workerId,
    startedAt,
    lastRunAt,
    lastRun,
    lastError,
    totals: { ...totals },
  });

  const emit = (): void => {
    const current = snapshot();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // A status listener must never break the worker.
      }
    }
  };

  const handlerFor = (jobType: string): JobHandler | null =>
    handlers.get(jobType as ManagedJobType) ?? null;

  const executeJob = async (
    job: JobRecord,
  ): Promise<'completed' | 'failed' | 'skipped'> => {
    const handler = handlerFor(job.jobType);

    if (handler === null) {
      await options.repository.fail({
        jobId: job.id,
        workerId,
        error: `No handler registered for job type: ${job.jobType}`,
        retryable: false,
        maxAttempts,
        retryDelaySeconds,
      });
      return 'skipped';
    }

    try {
      await handler.execute({ workerId, job });
      await options.repository.execute({
        jobId: job.id,
        workerId,
      });
      return 'completed';
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const stale =
        message.includes('stale_job') ||
        message.includes('stale_intelligence_job:');

      try {
        await options.repository.fail({
          jobId: job.id,
          workerId,
          error: message,
          retryable: !stale,
          maxAttempts,
          retryDelaySeconds,
        });
      } catch (failError) {
        lastError =
          failError instanceof Error
            ? failError.message
            : String(failError);
      }

      return 'failed';
    }
  };

  const runOnce = async (): Promise<JobEngineRunResult> => {
    const jobs = await options.repository.claim({
      deviceId,
      workerId,
      limit: concurrency,
      leaseSeconds,
    });

    if (jobs.length === 0) {
      lastRun = {
        claimed: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
      };
      lastRunAt = new Date().toISOString();
      emit();
      return lastRun;
    }

    const results = await Promise.all(jobs.map(executeJob));
    const result: JobEngineRunResult = {
      claimed: jobs.length,
      completed: results.filter((value) => value === 'completed').length,
      failed: results.filter((value) => value === 'failed').length,
      skipped: results.filter((value) => value === 'skipped').length,
    };

    lastRun = result;
    lastRunAt = new Date().toISOString();
    lastError =
      result.failed > 0
        ? lastError
        : null;

    totals = {
      claimed: totals.claimed + result.claimed,
      completed: totals.completed + result.completed,
      failed: totals.failed + result.failed,
      skipped: totals.skipped + result.skipped,
    };

    emit();
    return result;
  };

  const loop = async (): Promise<void> => {
    while (running) {
      try {
        await runOnce();
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : String(error);
        lastRunAt = new Date().toISOString();
        emit();

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 2000);
        });
        continue;
      }

      if (running) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1000);
        });
      }
    }
  };

  return {
    register(jobType, handler) {
      handlers.set(jobType, handler);
    },

    runOnce,

    snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async start() {
      if (status === 'running' || status === 'starting') {
        return;
      }

      if (status === 'stopping') {
        throw new Error('DJ Sync job engine is stopping.');
      }

      status = 'starting';
      startedAt = new Date().toISOString();
      lastError = null;
      emit();

      running = true;
      status = 'running';
      loopPromise = loop();
      emit();
    },

    async stop() {
      if (status === 'stopped') {
        return;
      }

      if (status === 'stopping') {
        if (loopPromise !== null) {
          await loopPromise;
        }
        return;
      }

      status = 'stopping';
      running = false;
      emit();

      const current = loopPromise;
      loopPromise = null;

      if (current !== null) {
        await current;
      }

      status = 'stopped';
      emit();
    },
  };
}
