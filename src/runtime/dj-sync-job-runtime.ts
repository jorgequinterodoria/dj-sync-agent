import type {
  JobRecord,
  JobExecutionResult,
} from '../jobs/job-types.js';

import {
  SupabaseJobRepository,
} from '../jobs/supabase-job-repository.js';

import {
  createJobEngine,
} from '../jobs/job-engine.js';

import {
  createIntelligenceJobHandlers,
} from '../jobs/job-handlers.js';

import {
  buildTrackIntelligenceProfileFromJobPayload,
} from '../intelligence/intelligence-engine.js';

export interface DJSyncJobRuntimeSnapshot {
  configured: boolean;
  status:
    | 'disabled'
    | 'stopped'
    | 'starting'
    | 'running'
    | 'stopping';
  workerId: string | null;
  startedAt: string | null;
  lastRunAt: string | null;
  lastRun: {
    claimed: number;
    completed: number;
    failed: number;
    skipped: number;
  } | null;
  lastError: string | null;
  totals: {
    claimed: number;
    completed: number;
    failed: number;
    skipped: number;
  };
}

export interface DJSyncJobRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;

  runOnce(): Promise<{
    claimed: number;
    completed: number;
    failed: number;
    skipped: number;
  }>;

  snapshot(): DJSyncJobRuntimeSnapshot;
}

export interface DJSyncJobRuntimeOptions {
  deviceId: string;
  apiUrl: string | null;
  apiKey: string | null;
}

export function createDJSyncJobRuntime(
  options: DJSyncJobRuntimeOptions,
): DJSyncJobRuntime {
  const deviceId =
    options.deviceId.trim();

  const apiUrl =
    options.apiUrl?.trim() ?? '';

  const apiKey =
    options.apiKey?.trim() ?? '';

  const configured =
    deviceId.length > 0 &&
    apiUrl.length > 0 &&
    apiKey.length > 0;

  let runtimeStatus:
    DJSyncJobRuntimeSnapshot['status'] =
    configured
      ? 'stopped'
      : 'disabled';

  let startedAt:
    string | null = null;

  let lastRunAt:
    string | null = null;

  let lastRun:
    DJSyncJobRuntimeSnapshot['lastRun'] =
    null;

  let lastError:
    string | null = null;

  const totals = {
    claimed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  let engine:
    ReturnType<typeof createJobEngine> | null =
    null;

  if (configured) {
    const repository =
      new SupabaseJobRepository({
        url: apiUrl,
        apiKey,
        agentId: deviceId,
      });

    engine =
      createJobEngine({
        repository,
        deviceId,
        concurrency: 2,
        leaseSeconds: 120,
        maxAttempts: 10,
        retryDelaySeconds: 30,
      });

    const handlers =
      createIntelligenceJobHandlers({
        refresh:
          async (
            job: JobRecord,
          ): Promise<JobExecutionResult> => {
            validateRefreshJob(job);

            const profile =
              buildTrackIntelligenceProfileFromJobPayload(
                job.payload,
                job.rbLocalUsn,
              );

            return {
              completed: true,
              output: {
                intelligenceProfile:
                  profile,
              },
            };
          },

        preferenceUpdate:
          async (
            job: JobRecord,
          ): Promise<void> => {
            validatePreferenceJob(job);
          },

        retire:
          async (
            job: JobRecord,
          ): Promise<void> => {
            validateRetireJob(job);
          },
      });

    engine.register(
      'track.intelligence.refresh',
      handlers.refresh,
    );

    engine.register(
      'track.preference.update',
      handlers.preferenceUpdate,
    );

    engine.register(
      'track.intelligence.retire',
      handlers.retire,
    );
  }

  const updateTotals = (
    result: {
      claimed: number;
      completed: number;
      failed: number;
      skipped: number;
    },
  ): void => {
    totals.claimed +=
      result.claimed;

    totals.completed +=
      result.completed;

    totals.failed +=
      result.failed;

    totals.skipped +=
      result.skipped;

    lastRun = {
      ...result,
    };

    lastRunAt =
      new Date().toISOString();
  };

  return {
    async start(): Promise<void> {
      if (!configured || engine === null) {
        runtimeStatus = 'disabled';
        return;
      }

      if (
        runtimeStatus === 'running' ||
        runtimeStatus === 'starting'
      ) {
        return;
      }

      if (
        runtimeStatus === 'stopping'
      ) {
        throw new Error(
          'DJ Sync job runtime is stopping.',
        );
      }

      runtimeStatus = 'starting';
      startedAt =
        new Date().toISOString();
      lastError = null;

      try {
        await engine.start();

        runtimeStatus =
          'running';
      } catch (error) {
        runtimeStatus =
          'stopped';

        lastError =
          error instanceof Error
            ? error.message
            : String(error);

        throw error;
      }
    },

    async stop(): Promise<void> {
      if (!configured || engine === null) {
        runtimeStatus = 'disabled';
        return;
      }

      if (
        runtimeStatus === 'stopped'
      ) {
        return;
      }

      if (
        runtimeStatus === 'stopping'
      ) {
        return;
      }

      runtimeStatus =
        'stopping';

      try {
        await engine.stop();

        runtimeStatus =
          'stopped';
      } catch (error) {
        runtimeStatus =
          'stopped';

        lastError =
          error instanceof Error
            ? error.message
            : String(error);

        throw error;
      }
    },

    async runOnce() {
      if (
        !configured ||
        engine === null
      ) {
        return {
          claimed: 0,
          completed: 0,
          failed: 0,
          skipped: 0,
        };
      }

      try {
        const result =
          await engine.runOnce();

        updateTotals(
          result,
        );

        lastError =
          null;

        return result;
      } catch (error) {
        lastError =
          error instanceof Error
            ? error.message
            : String(error);

        throw error;
      }
    },

    snapshot():
      DJSyncJobRuntimeSnapshot {
      return {
        configured,

        status:
          runtimeStatus,

        workerId:
          configured &&
          engine !== null
            ? 'runtime-worker'
            : null,

        startedAt,

        lastRunAt,

        lastRun,

        lastError,

        totals: {
          ...totals,
        },
      };
    },
  };
}

function validateRefreshJob(
  job: JobRecord,
): void {
  if (
    job.jobType !==
    'track.intelligence.refresh'
  ) {
    throw new Error(
      'Invalid refresh job type.',
    );
  }

  if (
    !job.trackId.trim()
  ) {
    throw new Error(
      'Refresh job requires a track id.',
    );
  }

  if (
    !job.payload ||
    typeof job.payload !== 'object'
  ) {
    throw new Error(
      'Refresh job requires a payload.',
    );
  }
}

function validatePreferenceJob(
  job: JobRecord,
): void {
  if (
    job.jobType !==
    'track.preference.update'
  ) {
    throw new Error(
      'Invalid preference job type.',
    );
  }

  if (
    !job.trackId.trim()
  ) {
    throw new Error(
      'Preference job requires a track id.',
    );
  }
}

function validateRetireJob(
  job: JobRecord,
): void {
  if (
    job.jobType !==
    'track.intelligence.retire'
  ) {
    throw new Error(
      'Invalid retire job type.',
    );
  }

  if (
    !job.trackId.trim()
  ) {
    throw new Error(
      'Retire job requires a track id.',
    );
  }
}