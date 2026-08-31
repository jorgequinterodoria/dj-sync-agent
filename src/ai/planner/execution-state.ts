export type ExecutionStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked';

export interface ExecutionStepState {
  readonly stepId: string;
  readonly status: ExecutionStepStatus;
  readonly attempts: number;
  readonly result?: unknown;
  readonly error?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface ExecutionStateSnapshot {
  readonly schemaVersion: 1;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly steps: readonly ExecutionStepState[];
}

export class ExecutionState {
  private readonly clock: () => string;
  private readonly state =
    new Map<string, ExecutionStepState>();

  private readonly startedAt: string;

  public constructor(
    now: () => string = () =>
      new Date().toISOString(),
  ) {
    this.clock = now;
    this.startedAt = now();
  }

  public ensure(
    stepId: string,
  ): ExecutionStepState {
    const existing =
      this.state.get(stepId);

    if (existing) {
      return existing;
    }

    const created: ExecutionStepState = {
      stepId,
      status: 'pending',
      attempts: 0,
    };

    this.state.set(
      stepId,
      created,
    );

    return created;
  }

  public start(
    stepId: string,
  ): ExecutionStepState {
    const current =
      this.ensure(stepId);

    const next: ExecutionStepState = {
      stepId,
      status: 'running',
      attempts:
        current.attempts + 1,
      ...(current.result !== undefined
        ? {
            result: current.result,
          }
        : {}),
      startedAt: this.clock(),
    };

    this.state.set(
      stepId,
      next,
    );

    return next;
  }

  public complete(
    stepId: string,
    result: unknown,
  ): ExecutionStepState {
    const current =
      this.ensure(stepId);

    const next: ExecutionStepState = {
      ...current,
      status: 'completed',
      result,
      finishedAt: this.clock(),
    };

    this.state.set(
      stepId,
      next,
    );

    return next;
  }

  public fail(
    stepId: string,
    error: string,
  ): ExecutionStepState {
    const current =
      this.ensure(stepId);

    const next: ExecutionStepState = {
      ...current,
      status: 'failed',
      error: error.trim(),
      finishedAt: this.clock(),
    };

    this.state.set(
      stepId,
      next,
    );

    return next;
  }

  public block(
    stepId: string,
    error: string,
  ): ExecutionStepState {
    const current =
      this.ensure(stepId);

    const next: ExecutionStepState = {
      ...current,
      status: 'blocked',
      error: error.trim(),
      finishedAt: this.clock(),
    };

    this.state.set(
      stepId,
      next,
    );

    return next;
  }

  public get(
    stepId: string,
  ): ExecutionStepState | undefined {
    return this.state.get(stepId);
  }

  public snapshot(): ExecutionStateSnapshot {
    return {
      schemaVersion: 1,
      startedAt: this.startedAt,
      updatedAt: this.clock(),
      steps: [...this.state.values()],
    };
  }
}
