export interface ChangeCursor {
  rbLocalUsn: number;
  id: string;
}

export interface PersistedChangeCursor {
  schemaVersion: 1;
  updatedAt: string;
  cursor: ChangeCursor | null;
}

export function compareCursors(
  a: ChangeCursor,
  b: ChangeCursor,
): number {
  if (a.rbLocalUsn !== b.rbLocalUsn) {
    return a.rbLocalUsn - b.rbLocalUsn;
  }

  return a.id.localeCompare(b.id);
}

export function isAfterCursor(
  value: ChangeCursor,
  cursor: ChangeCursor | null,
): boolean {
  if (!cursor) return true;
  return compareCursors(value, cursor) > 0;
}

export function validateCursor(
  cursor: unknown,
): asserts cursor is ChangeCursor {
  if (!cursor || typeof cursor !== 'object') {
    throw new Error('Invalid change cursor.');
  }

  const value = cursor as Partial<ChangeCursor>;

  if (!Number.isFinite(value.rbLocalUsn)) {
    throw new Error('Invalid cursor rbLocalUsn.');
  }

  if (typeof value.id !== 'string') {
    throw new Error('Invalid cursor id.');
  }
}
