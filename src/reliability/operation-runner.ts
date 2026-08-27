import {
  createRetryPolicy,
  retryDelayMs,
} from './retry-policy.js';

import type {
  RetryPolicy,
  RetryPolicyOptions,
} from './retry-policy.js';

export interface OperationRunnerOptions {
  readonly retry?: RetryPolicy | RetryPolicyOptions;
  readonly isRetryable?: (
    error: unknown,
  ) => boolean;
  readonly sleep?: (
    delayMs: number,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly random?: () => number;
  readonly onRetry?: (
    input: {
      readonly attempt: number;
      readonly delayMs: number;
      readonly error: unknown;
    },
  ) => void;
  readonly signal?: AbortSignal;
}

export interface OperationRunResult<T> {
  readonly value: T;
  readonly attempts: number;
}

function policyFrom(
  input:
    | RetryPolicy
    | RetryPolicyOptions
    | undefined,
): RetryPolicy {
  if (
    input === undefined
  ) {
    return createRetryPolicy();
  }

  return createRetryPolicy(
    input,
  );
}

function defaultRetryable(
  _error: unknown,
): boolean {
  return true;
}

async function defaultSleep(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (
    delayMs <= 0
  ) {
    return;
  }

  await new Promise<void>(
    (resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        signal.removeEventListener(
          'abort',
          onAbort,
        );
      };

      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve();
      };

      const rejectOnce = (
        error: Error,
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      };

      const timer =
        setTimeout(
          resolveOnce,
          delayMs,
        );

      const onAbort = () => {
        clearTimeout(timer);

        rejectOnce(
          new Error(
            'Operation sleep was cancelled.',
          ),
        );
      };

      if (
        signal.aborted
      ) {
        onAbort();
        return;
      }

      signal.addEventListener(
        'abort',
        onAbort,
        {
          once: true,
        },
      );
    },
  );
}

function throwIfAborted(
  signal: AbortSignal,
): void {
  if (
    signal.aborted
  ) {
    throw new Error(
      'Operation was cancelled.',
    );
  }
}

export async function runWithRetry<T>(
  operation: (
    attempt: number,
    signal: AbortSignal,
  ) => Promise<T>,
  options: OperationRunnerOptions = {},
): Promise<OperationRunResult<T>> {
  const policy =
    policyFrom(
      options.retry,
    );

  const isRetryable =
    options.isRetryable ??
    defaultRetryable;

  const sleep =
    options.sleep ??
    defaultSleep;

  const random =
    options.random ??
    Math.random;

  const signal =
    options.signal ??
    new AbortController()
      .signal;

  let lastError:
    | unknown
    | undefined;

  for (
    let attempt = 1;
    attempt <=
      policy.maxAttempts;
    attempt += 1
  ) {
    throwIfAborted(
      signal,
    );

    try {
      const value =
        await operation(
          attempt,
          signal,
        );

      return {
        value,
        attempts: attempt,
      };
    } catch (
      error
    ) {
      lastError =
        error;

      if (
        attempt >=
          policy.maxAttempts ||
        !isRetryable(error)
      ) {
        throw error;
      }

      throwIfAborted(
        signal,
      );

      const delayMs =
        retryDelayMs(
          policy,
          attempt,
          {
            random,
          },
        );

      options.onRetry?.({
        attempt,
        delayMs,
        error,
      });

      await sleep(
        delayMs,
        signal,
      );
    }
  }

  throw (
    lastError ??
    new Error(
      'Operation failed without an error.',
    )
  );
}
