export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly jitterRatio: number;
}

export interface RetryPolicyOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly backoffMultiplier?: number;
  readonly jitterRatio?: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
  backoffMultiplier: 2,
  jitterRatio: 0.2,
};

function positiveFinite(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive finite number.`,
    );
  }

  return value;
}

function nonNegativeFinite(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }

  return value;
}

export function createRetryPolicy(
  options: RetryPolicyOptions = {},
): RetryPolicy {
  const maxAttempts =
    options.maxAttempts ??
    DEFAULT_RETRY_POLICY.maxAttempts;

  const baseDelayMs =
    options.baseDelayMs ??
    DEFAULT_RETRY_POLICY.baseDelayMs;

  const maxDelayMs =
    options.maxDelayMs ??
    DEFAULT_RETRY_POLICY.maxDelayMs;

  const backoffMultiplier =
    options.backoffMultiplier ??
    DEFAULT_RETRY_POLICY.backoffMultiplier;

  const jitterRatio =
    options.jitterRatio ??
    DEFAULT_RETRY_POLICY.jitterRatio;

  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1
  ) {
    throw new Error(
      'maxAttempts must be a positive integer.',
    );
  }

  positiveFinite(
    baseDelayMs,
    'baseDelayMs',
  );

  positiveFinite(
    maxDelayMs,
    'maxDelayMs',
  );

  if (
    maxDelayMs <
    baseDelayMs
  ) {
    throw new Error(
      'maxDelayMs must be greater than or equal to baseDelayMs.',
    );
  }

  if (
    !Number.isFinite(
      backoffMultiplier,
    ) ||
    backoffMultiplier < 1
  ) {
    throw new Error(
      'backoffMultiplier must be at least 1.',
    );
  }

  nonNegativeFinite(
    jitterRatio,
    'jitterRatio',
  );

  if (
    jitterRatio > 1
  ) {
    throw new Error(
      'jitterRatio must be less than or equal to 1.',
    );
  }

  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitterRatio,
  };
}

export interface RetryDelayOptions {
  readonly random?: () => number;
}

export function retryDelayMs(
  policy: RetryPolicy,
  attempt: number,
  options: RetryDelayOptions = {},
): number {
  if (
    !Number.isInteger(attempt) ||
    attempt < 1
  ) {
    throw new Error(
      'attempt must be a positive integer.',
    );
  }

  const random =
    options.random ??
    Math.random;

  const exponent =
    Math.max(
      0,
      attempt - 1,
    );

  const raw =
    Math.min(
      policy.maxDelayMs,
      policy.baseDelayMs *
        policy.backoffMultiplier **
          exponent,
    );

  const randomValue =
    Math.max(
      0,
      Math.min(
        1,
        random(),
      ),
    );

  const jitter =
    1 +
    (
      randomValue *
        2 -
        1
    ) *
      policy.jitterRatio;

  return Math.max(
    0,
    Math.min(
      policy.maxDelayMs,
      Math.round(
        raw * jitter,
      ),
    ),
  );
}
