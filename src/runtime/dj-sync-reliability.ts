import {
  CircuitBreaker,
  createRetryPolicy,
  runWithRetry,
  InMemoryIdempotencyStore,
  InMemoryRecoveryJournal,
  mapWithConcurrency,
} from '../reliability/index.js';

import type {
  RetryPolicyOptions,
} from '../reliability/retry-policy.js';

export interface DJSyncReliabilityOptions {
  readonly retry?: RetryPolicyOptions;
  readonly circuitFailureThreshold?: number;
  readonly circuitResetTimeoutMs?: number;
  readonly concurrency?: number;
}

export interface DJSyncReliability {
  readonly retryPolicy: ReturnType<
    typeof createRetryPolicy
  >;

  readonly circuitBreaker:
    CircuitBreaker;

  readonly idempotency:
    InMemoryIdempotencyStore<unknown>;

  readonly recovery:
    InMemoryRecoveryJournal<unknown>;

  run<T>(
    operation: (
      attempt: number,
      signal: AbortSignal,
    ) => Promise<T>,
  ): Promise<{
    readonly value: T;
    readonly attempts: number;
  }>;

  map<T, R>(
    items: readonly T[],
    mapper: (
      item: T,
      index: number,
      signal: AbortSignal | undefined,
    ) => Promise<R>,
    signal?: AbortSignal,
  ): Promise<readonly R[]>;
}

export function createDJSyncReliability(
  options:
    DJSyncReliabilityOptions = {},
): DJSyncReliability {
  const retryPolicy =
    createRetryPolicy(
      options.retry,
    );

  const circuitBreaker =
    new CircuitBreaker({
      ...(options.circuitFailureThreshold !==
      undefined
        ? {
            failureThreshold:
              options.circuitFailureThreshold,
          }
        : {}),
      ...(options.circuitResetTimeoutMs !==
      undefined
        ? {
            resetTimeoutMs:
              options.circuitResetTimeoutMs,
          }
        : {}),
    });

  const idempotency =
    new InMemoryIdempotencyStore<unknown>();

  const recovery =
    new InMemoryRecoveryJournal<unknown>();

  const concurrency =
    options.concurrency ??
    4;

  return {
    retryPolicy,
    circuitBreaker,
    idempotency,
    recovery,

    async run(operation) {
      return circuitBreaker.execute(
        () =>
          runWithRetry(
            operation,
            {
              retry:
                retryPolicy,
            },
          ),
      );
    },

    map(
      items,
      mapper,
      signal,
    ) {
      return mapWithConcurrency(
        items,
        mapper,
        {
          concurrency,
          ...(signal !== undefined
            ? {
                signal,
              }
            : {}),
        },
      );
    },
  };
}
