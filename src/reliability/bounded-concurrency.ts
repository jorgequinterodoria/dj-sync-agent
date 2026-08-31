export interface BoundedConcurrencyOptions {
  readonly concurrency: number;
  readonly signal?: AbortSignal;
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

function throwIfAborted(
  signal: AbortSignal | undefined,
): void {
  if (
    signal?.aborted
  ) {
    throw new Error(
      'Bounded operation was cancelled.',
    );
  }
}

export async function mapWithConcurrency<
  T,
  R,
>(
  items: readonly T[],
  mapper: (
    item: T,
    index: number,
    signal: AbortSignal | undefined,
  ) => Promise<R>,
  options: BoundedConcurrencyOptions,
): Promise<readonly R[]> {
  const concurrency =
    positiveInteger(
      options.concurrency,
      'concurrency',
    );

  if (
    items.length === 0
  ) {
    return [];
  }

  const results:
    R[] =
    new Array(
      items.length,
    );

  let nextIndex = 0;

  const worker =
    async (): Promise<void> => {
      while (true) {
        throwIfAborted(
          options.signal,
        );

        const index =
          nextIndex;

        nextIndex += 1;

        if (
          index >=
          items.length
        ) {
          return;
        }

        const item =
          items[index];

        if (
          item ===
          undefined
        ) {
          throw new Error(
            'Bounded concurrency item is unexpectedly undefined.',
          );
        }

        results[index] =
          await mapper(
            item,
            index,
            options.signal,
          );
      }
    };

  const workerCount =
    Math.min(
      concurrency,
      items.length,
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount,
      },
      () =>
        worker(),
    ),
  );

  return results;
}
