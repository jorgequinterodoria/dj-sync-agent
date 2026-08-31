import type { JobRecord } from './job-types.js';

export interface JobRepository {
  claim(
    options: {
      deviceId: string;
      workerId: string;
      limit: number;
      leaseSeconds: number;
    },
  ): Promise<JobRecord[]>;

  execute(
    options: {
      jobId: number;
      workerId: string;
      output?: unknown;
    },
  ): Promise<JobRecord>;

  fail(
    options: {
      jobId: number;
      workerId: string;
      error: string;
      retryable: boolean;
      maxAttempts: number;
      retryDelaySeconds: number;
    },
  ): Promise<JobRecord>;
}
