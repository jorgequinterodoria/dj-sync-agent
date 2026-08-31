export type RecoveryEntryStatus =
  | 'started'
  | 'checkpoint'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RecoveryEntry<T = unknown> {
  readonly requestId: string;
  readonly status: RecoveryEntryStatus;
  readonly sequence: number;
  readonly timestampMs: number;
  readonly checkpoint?: T;
  readonly error?: string;
}

export interface RecoveryJournal<T = unknown> {
  append(
    entry: RecoveryEntry<T>,
  ): Promise<void>;

  latest(
    requestId: string,
  ): Promise<
    RecoveryEntry<T> | undefined
  >;

  list(
    requestId: string,
  ): Promise<
    readonly RecoveryEntry<T>[]
  >;
}

function required(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return normalized;
}

export class InMemoryRecoveryJournal<T = unknown>
  implements RecoveryJournal<T> {
  private readonly entries:
    RecoveryEntry<T>[] =
    [];

  public async append(
    entry: RecoveryEntry<T>,
  ): Promise<void> {
    const requestId =
      required(
        entry.requestId,
        'Recovery requestId',
      );

    if (
      !Number.isInteger(
        entry.sequence,
      ) ||
      entry.sequence < 1
    ) {
      throw new Error(
        'Recovery sequence must be a positive integer.',
      );
    }

    if (
      !Number.isFinite(
        entry.timestampMs,
      )
    ) {
      throw new Error(
        'Recovery timestamp must be finite.',
      );
    }

    this.entries.push({
      ...entry,
      requestId,
    });
  }

  public async latest(
    requestId: string,
  ): Promise<
    RecoveryEntry<T> | undefined
  > {
    const entries =
      await this.list(
        requestId,
      );

    return entries.at(
      -1,
    );
  }

  public async list(
    requestId: string,
  ): Promise<
    readonly RecoveryEntry<T>[]
  > {
    const normalized =
      required(
        requestId,
        'Recovery requestId',
      );

    return this.entries
      .filter(
        (entry) =>
          entry.requestId ===
          normalized,
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.sequence -
          b.sequence,
      )
      .map(
        (entry) => ({
          ...entry,
        }),
      );
  }
}
