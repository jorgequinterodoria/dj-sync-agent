import type {
  JobRecord,
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

export interface DJSyncJobRuntime {
  start():
    Promise<void>;

  stop():
    Promise<void>;

  runOnce():
    Promise<{
      claimed:
        number;

      completed:
        number;

      failed:
        number;

      skipped:
        number;
    }>;
}

export interface DJSyncJobRuntimeOptions {
  deviceId:
    string;

  apiUrl:
    string;

  apiKey:
    string;
}

export function createDJSyncJobRuntime(
  options:
    DJSyncJobRuntimeOptions,
):
  DJSyncJobRuntime {
  const repository =
    new SupabaseJobRepository({
      url:
        options.apiUrl,

      apiKey:
        options.apiKey,

      agentId:
        options.deviceId,
    });

  const engine =
    createJobEngine({
      repository,

      deviceId:
        options.deviceId,

      concurrency:
        2,

      leaseSeconds:
        120,

      maxAttempts:
        10,

      retryDelaySeconds:
        30,
    });

  const handlers =
    createIntelligenceJobHandlers({
      refresh:
        async (
          job:
            JobRecord,
        ) => {
          validateRefreshJob(
            job,
          );
        },

      preferenceUpdate:
        async (
          job:
            JobRecord,
        ) => {
          validatePreferenceJob(
            job,
          );
        },

      retire:
        async (
          job:
            JobRecord,
        ) => {
          validateRetireJob(
            job,
          );
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

  return {
    start:
      () =>
        engine.start(),

    stop:
      () =>
        engine.stop(),

    runOnce:
      () =>
        engine.runOnce(),
  };
}

function validateRefreshJob(
  job:
    JobRecord,
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
    typeof job.payload !==
      'object'
  ) {
    throw new Error(
      'Refresh job requires a payload.',
    );
  }
}

function validatePreferenceJob(
  job:
    JobRecord,
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
  job:
    JobRecord,
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