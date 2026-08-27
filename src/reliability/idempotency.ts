export interface IdempotencyEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly createdAtMs: number;
}

export interface IdempotencyStore<T> {
  get(
    key: string,
  ):
    | IdempotencyEntry<T>
    | undefined;

  put(
    entry: IdempotencyEntry<T>,
  ): void;

  has(
    key: string,
  ): boolean;

  clear(): void;
}

export class InMemoryIdempotencyStore<T>
  implements IdempotencyStore<T> {
  private readonly entries =
    new Map<
      string,
      IdempotencyEntry<T>
    >();

  public get(
    key: string,
  ):
    | IdempotencyEntry<T>
    | undefined {
    return this.entries.get(
      key.trim(),
    );
  }

  public put(
    entry: IdempotencyEntry<T>,
  ): void {
    const key =
      entry.key.trim();

    if (!key) {
      throw new Error(
        'Idempotency key is required.',
      );
    }

    if (
      !Number.isFinite(
        entry.createdAtMs,
      )
    ) {
      throw new Error(
        'Idempotency createdAtMs must be finite.',
      );
    }

    this.entries.set(
      key,
      {
        ...entry,
        key,
      },
    );
  }

  public has(
    key: string,
  ): boolean {
    return this.entries.has(
      key.trim(),
    );
  }

  public clear(): void {
    this.entries.clear();
  }
}

export async function runIdempotently<T>(
  store: IdempotencyStore<T>,
  key: string,
  operation: () => Promise<T>,
  now: () => number = Date.now,
): Promise<{
  readonly value: T;
  readonly reused: boolean;
}> {
  const normalized =
    key.trim();

  if (!normalized) {
    throw new Error(
      'Idempotency key is required.',
    );
  }

  const existing =
    store.get(
      normalized,
    );

  if (
    existing !==
    undefined
  ) {
    return {
      value:
        existing.value,
      reused:
        true,
    };
  }

  const value =
    await operation();

  store.put({
    key:
      normalized,
    value,
    createdAtMs:
      now(),
  });

  return {
    value,
    reused:
      false,
  };
}
