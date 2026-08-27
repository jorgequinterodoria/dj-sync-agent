export type CircuitState =
  | 'closed'
  | 'open'
  | 'half-open';

export interface CircuitBreakerOptions {
  readonly failureThreshold?: number;
  readonly resetTimeoutMs?: number;
  readonly now?: () => number;
}

export interface CircuitSnapshot {
  readonly state: CircuitState;
  readonly failures: number;
  readonly openedAtMs?: number;
}

function positiveInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `${field} must be a positive integer.`,
    );
  }

  return value;
}

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

export class CircuitBreaker {
  private readonly failureThreshold:
    number;

  private readonly resetTimeoutMs:
    number;

  private readonly now:
    () => number;

  private stateValue:
    CircuitState = 'closed';

  private failuresValue =
    0;

  private openedAtMsValue:
    number | undefined;

  public constructor(
    options:
      CircuitBreakerOptions = {},
  ) {
    this.failureThreshold =
      positiveInteger(
        options.failureThreshold ??
          5,
        'failureThreshold',
      );

    this.resetTimeoutMs =
      positiveFinite(
        options.resetTimeoutMs ??
          30_000,
        'resetTimeoutMs',
      );

    this.now =
      options.now ??
      Date.now;
  }

  public get state():
    CircuitState {
    this.refresh();

    return this.stateValue;
  }

  public snapshot():
    CircuitSnapshot {
    this.refresh();

    return {
      state:
        this.stateValue,
      failures:
        this.failuresValue,
      ...(this.openedAtMsValue !==
      undefined
        ? {
            openedAtMs:
              this.openedAtMsValue,
          }
        : {}),
    };
  }

  public allowRequest():
    boolean {
    this.refresh();

    if (
      this.stateValue ===
      'open'
    ) {
      return false;
    }

    return true;
  }

  public recordSuccess(): void {
    this.stateValue =
      'closed';

    this.failuresValue =
      0;

    this.openedAtMsValue =
      undefined;
  }

  public recordFailure(): void {
    this.refresh();

    if (
      this.stateValue ===
      'half-open'
    ) {
      this.openCircuit();
      return;
    }

    this.failuresValue += 1;

    if (
      this.failuresValue >=
      this.failureThreshold
    ) {
      this.openCircuit();
    }
  }

  public async execute<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    if (
      !this.allowRequest()
    ) {
      throw new Error(
        'Circuit breaker is open.',
      );
    }

    this.stateValue =
      this.stateValue ===
      'closed'
        ? 'closed'
        : 'half-open';

    try {
      const result =
        await operation();

      this.recordSuccess();

      return result;
    } catch (
      error
    ) {
      this.recordFailure();

      throw error;
    }
  }

  private refresh(): void {
    if (
      this.stateValue !==
      'open' ||
      this.openedAtMsValue ===
        undefined
    ) {
      return;
    }

    if (
      this.now() -
        this.openedAtMsValue >=
      this.resetTimeoutMs
    ) {
      this.stateValue =
        'half-open';
    }
  }

  private openCircuit(): void {
    this.stateValue =
      'open';

    this.openedAtMsValue =
      this.now();
  }
}
