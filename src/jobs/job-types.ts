export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ManagedJobType =
  | 'track.intelligence.refresh'
  | 'track.preference.update'
  | 'track.intelligence.retire';

export interface JobRecord {
  id: number;
  jobKey: string;
  jobType: string;
  status: JobStatus;
  priority: number;
  eventId: string;
  deviceId: string;
  trackId: string;
  rbLocalUsn: number | null;
  payload: unknown;
  attempts: number;
  availableAt: string;
  lockedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  lockedBy: string | null;
}

export interface JobExecutionContext {
  workerId: string;
  job: JobRecord;
}

export interface JobExecutionResult {
  completed: boolean;
  output?: unknown;
}

export interface JobHandler {
  execute(
    context: JobExecutionContext,
  ): Promise<JobExecutionResult>;
}
