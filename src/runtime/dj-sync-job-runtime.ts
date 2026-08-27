import type { JobRecord } from '../jobs/job-types.js';
import {
  createJobEngine,
  type JobEngine,
} from '../jobs/job-engine.js';
import { createIntelligenceJobHandlers } from '../jobs/job-handlers.js';
import { SupabaseJobRepository } from '../jobs/supabase-job-repository.js';
import type { JobEngineRunResult, JobEngineSnapshot } from '../jobs/job-types.js';

export type DJSyncJobRuntimeStatus =
  | 'disabled'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping';

export interface DJSyncJobRuntimeSnapshot {
  configured: boolean;
  status: DJSyncJobRuntimeStatus;
  workerId: string | null;
  startedAt: string | null;
  lastRunAt: string | null;
  lastRun: JobEngineRunResult | null;
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
  runOnce(): Promise<JobEngineRunResult>;
  snapshot(): DJSyncJobRuntimeSnapshot;
  subscribe(
    listener: (snapshot: DJSyncJobRuntimeSnapshot) => void,
  ): () => void;
}

export interface DJSyncJobRuntimeOptions {
  deviceId: string;
  apiUrl?: string | null;
  apiKey?: string | null;
}

function disabledSnapshot(): DJSyncJobRuntimeSnapshot {
  return {
    configured: false,
    status: 'disabled',
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
  };
}

export function createDJSyncJobRuntime(
  options: DJSyncJobRuntimeOptions,
): DJSyncJobRuntime {
  const deviceId = options.deviceId.trim();
  const apiUrl = options.apiUrl?.trim() ?? '';
  const apiKey = options.apiKey?.trim() ?? '';

  if (!deviceId) {
    throw new Error('SYNC_AGENT_ID is required.');
  }

  if (!apiUrl && !apiKey) {
    return {
      async start() {},
      async stop() {},
      async runOnce() {
        throw new Error('Intelligence job runtime is not configured.');
      },
      snapshot() {
        return disabledSnapshot();
      },
      subscribe(_listener) {
        return () => {};
      },
    };
  }

  if (!apiUrl) {
    throw new Error('INTELLIGENCE_JOBS_API_URL is required.');
  }

  if (!apiKey) {
    throw new Error('SYNC_API_KEY is required.');
  }

  const repository = new SupabaseJobRepository({
    url: apiUrl,
    apiKey,
    agentId: deviceId,
  });

  const engine: JobEngine = createJobEngine({
    repository,
    deviceId,
    concurrency: 2,
    leaseSeconds: 120,
    maxAttempts: 10,
    retryDelaySeconds: 30,
  });

  const listeners = new Set<
    (snapshot: DJSyncJobRuntimeSnapshot) => void
  >();

  const mapSnapshot = (
    value: JobEngineSnapshot,
  ): DJSyncJobRuntimeSnapshot => ({
    configured: true,
    status: value.status,
    workerId: value.workerId,
    startedAt: value.startedAt,
    lastRunAt: value.lastRunAt,
    lastRun: value.lastRun,
    lastError: value.lastError,
    totals: value.totals,
  });

  const unsubscribeEngine = engine.subscribe((value) => {
    const mapped = mapSnapshot(value);
    for (const listener of listeners) {
      try {
        listener(mapped);
      } catch {
        // A listener must never break the job runtime.
      }
    }
  });

  const handlers = createIntelligenceJobHandlers({
    refresh: async (job: JobRecord) => {
      validateRefreshJob(job);
    },
    preferenceUpdate: async (job: JobRecord) => {
      validatePreferenceJob(job);
    },
    retire: async (job: JobRecord) => {
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

  return {
    start: () => engine.start(),
    stop: () => engine.stop(),
    runOnce: () => engine.runOnce(),
    snapshot: () => mapSnapshot(engine.snapshot()),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function validateRefreshJob(job: JobRecord): void {
  if (job.jobType !== 'track.intelligence.refresh') {
    throw new Error('Invalid refresh job type.');
  }
  if (!job.trackId.trim()) {
    throw new Error('Refresh job requires a track id.');
  }
  if (!job.payload || typeof job.payload !== 'object') {
    throw new Error('Refresh job requires a payload.');
  }
}

function validatePreferenceJob(job: JobRecord): void {
  if (job.jobType !== 'track.preference.update') {
    throw new Error('Invalid preference job type.');
  }
  if (!job.trackId.trim()) {
    throw new Error('Preference job requires a track id.');
  }
}

function validateRetireJob(job: JobRecord): void {
  if (job.jobType !== 'track.intelligence.retire') {
    throw new Error('Invalid retire job type.');
  }
  if (!job.trackId.trim()) {
    throw new Error('Retire job requires a track id.');
  }
}
