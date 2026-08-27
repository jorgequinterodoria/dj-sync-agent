import {
  request as httpRequest,
} from 'node:http';

import {
  request as httpsRequest,
} from 'node:https';

import type {
  JobRepository,
} from './job-repository.js';

import type {
  JobRecord,
} from './job-types.js';

interface HttpResponse {
  statusCode: number;
  body: string;
}

function parseJob(
  value: unknown,
): JobRecord {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    throw new Error(
      'Invalid job response.',
    );
  }

  const row =
    value as Record<
      string,
      unknown
    >;

  return {
    id:
      Number(row.id),

    jobKey:
      String(
        row.job_key,
      ),

    jobType:
      String(
        row.job_type,
      ),

    status:
      String(
        row.status,
      ) as JobRecord['status'],

    priority:
      Number(
        row.priority,
      ),

    eventId:
      String(
        row.event_id,
      ),

    deviceId:
      String(
        row.device_id,
      ),

    trackId:
      String(
        row.track_id,
      ),

    rbLocalUsn:
      typeof row.rb_local_usn ===
        'number'
        ? row.rb_local_usn
        : null,

    payload:
      row.payload,

    attempts:
      Number(
        row.attempts,
      ),

    availableAt:
      String(
        row.available_at,
      ),

    lockedAt:
      typeof row.locked_at ===
        'string'
        ? row.locked_at
        : null,

    startedAt:
      typeof row.started_at ===
        'string'
        ? row.started_at
        : null,

    completedAt:
      typeof row.completed_at ===
        'string'
        ? row.completed_at
        : null,

    lastError:
      typeof row.last_error ===
        'string'
        ? row.last_error
        : null,

    createdAt:
      String(
        row.created_at,
      ),

    updatedAt:
      String(
        row.updated_at,
      ),

    lockedBy:
      typeof row.locked_by ===
        'string'
        ? row.locked_by
        : null,
  };
}

export interface SupabaseJobRepositoryOptions {
  url: string;
  apiKey: string;
  agentId: string;
  timeoutMs?: number;
}

export class SupabaseJobRepository
  implements JobRepository {
  private readonly url: URL;
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly timeoutMs: number;

  public constructor(
    options:
      SupabaseJobRepositoryOptions,
  ) {
    if (
      !options.apiKey.trim()
    ) {
      throw new Error(
        'SYNC_API_KEY is required.',
      );
    }

    if (
      !options.agentId.trim()
    ) {
      throw new Error(
        'SYNC_AGENT_ID is required.',
      );
    }

    this.url =
      new URL(
        options.url,
      );

    if (
      this.url.protocol !==
        'http:' &&
      this.url.protocol !==
        'https:'
    ) {
      throw new Error(
        `Unsupported intelligence jobs API protocol: ${this.url.protocol}`,
      );
    }

    this.apiKey =
      options.apiKey;

    this.agentId =
      options.agentId;

    this.timeoutMs =
      options.timeoutMs ??
      20_000;
  }

  private async request(
    body:
      Record<
        string,
        unknown
      >,
  ):
    Promise<
      Record<
        string,
        unknown
      >
    > {
    const payload =
      JSON.stringify(
        body,
      );

    const headers:
      Record<
        string,
        string
      > = {
      'content-type':
        'application/json',

      'content-length':
        Buffer.byteLength(
          payload,
        ).toString(),

      authorization:
        `Bearer ${this.apiKey}`,

      'x-api-key':
        this.apiKey,

      'x-agent-id':
        this.agentId,

      accept:
        'application/json',

      'user-agent':
        'dj-sync-agent/0.9.5',
    };

    const response =
      await new Promise<
        HttpResponse
      >(
        (
          resolve,
          reject,
        ) => {
          const requester =
            this.url.protocol ===
            'https:'
              ? httpsRequest
              : httpRequest;

          const req =
            requester(
              {
                method:
                  'POST',

                hostname:
                  this.url.hostname,

                port:
                  this.url.port ||
                  (
                    this.url.protocol ===
                    'https:'
                      ? 443
                      : 80
                  ),

                path:
                  `${this.url.pathname}${this.url.search}`,

                headers,
              },
              (
                res,
              ) => {
                const chunks:
                  Buffer[] = [];

                res.on(
                  'data',
                  (
                    chunk:
                      Buffer,
                  ) => {
                    chunks.push(
                      Buffer.isBuffer(
                        chunk,
                      )
                        ? chunk
                        : Buffer.from(
                            chunk,
                          ),
                    );
                  },
                );

                res.on(
                  'end',
                  () => {
                    resolve({
                      statusCode:
                        res.statusCode ??
                        0,

                      body:
                        Buffer.concat(
                          chunks,
                        ).toString(
                          'utf8',
                        ),
                    });
                  },
                );
              },
            );

          req.setTimeout(
            this.timeoutMs,
            () => {
              req.destroy(
                new Error(
                  `Intelligence jobs API request timed out after ${this.timeoutMs} ms.`,
                ),
              );
            },
          );

          req.on(
            'error',
            reject,
          );

          req.write(
            payload,
          );

          req.end();
        },
      );

    let parsed:
      unknown;

    try {
      parsed =
        JSON.parse(
          response.body,
        );
    } catch {
      throw new Error(
        `Intelligence jobs API returned non-JSON response (HTTP ${response.statusCode}).`,
      );
    }

    if (
      response.statusCode <
        200 ||
      response.statusCode >=
        300
    ) {
      const detail =
        parsed &&
        typeof parsed ===
          'object' &&
        'error' in
          parsed
          ? String(
              (
                parsed as {
                  error?:
                    unknown;
                }
              ).error,
            )
          : response.body.slice(
              0,
              500,
            );

      throw new Error(
        `Intelligence jobs API rejected request: HTTP ${response.statusCode}: ${detail}`,
      );
    }

    return parsed as Record<
      string,
      unknown
    >;
  }

  public async claim(
    options: {
      deviceId: string;
      workerId: string;
      limit: number;
      leaseSeconds: number;
    },
  ):
    Promise<JobRecord[]> {
    const response =
      await this.request({
        action:
          'claim',

        workerId:
          options.workerId,

        limit:
          options.limit,

        leaseSeconds:
          options.leaseSeconds,
      });

    return Array.isArray(
      response.jobs,
    )
      ? response.jobs.map(
          parseJob,
        )
      : [];
  }

  public async execute(
    options: {
      jobId: number;
      workerId: string;
      output?: unknown;
    },
  ):
    Promise<JobRecord> {
    const response =
      await this.request({
        action:
          'execute',

        jobId:
          options.jobId,

        workerId:
          options.workerId,

        output:
          options.output,
      });

    return parseJob(
      response.job,
    );
  }

  public async fail(
    options: {
      jobId: number;
      workerId: string;
      error: string;
      retryable: boolean;
      maxAttempts: number;
      retryDelaySeconds: number;
    },
  ):
    Promise<JobRecord> {
    const response =
      await this.request({
        action:
          'fail',

        jobId:
          options.jobId,

        workerId:
          options.workerId,

        error:
          options.error,

        retryable:
          options.retryable,

        maxAttempts:
          options.maxAttempts,

        retryDelaySeconds:
          options.retryDelaySeconds,
      });

    return parseJob(
      response.job,
    );
  }
}