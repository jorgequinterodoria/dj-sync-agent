import type { SqliteDatabase } from '../rekordbox/sqlcipher.js';
import { all } from '../rekordbox/sqlcipher.js';
import type { ChangeCursor } from './change-cursor.js';

export interface ChangeCandidate {
  id: string;
  uuid: string | null;

  rbLocalUsn: number;
  usn: number | null;

  updatedAt: string | null;
  createdAt: string | null;

  rbLocalDeleted: number;
  rbLocalSynced: number;

  rbDataStatus: number | null;
  rbLocalDataStatus: number | null;
}

export interface ChangeBatchResult {
  schemaVersion: 2;
  generatedAt: string;

  cursorBefore: ChangeCursor | null;
  cursorAfter: ChangeCursor | null;

  batchSize: number;
  returned: number;
  hasMore: boolean;

  activeCount: number;
  deletedCount: number;

  candidates: ChangeCandidate[];
}

interface CandidateRow {
  ID: string;
  UUID: string | null;

  rb_local_usn:
    | number
    | string
    | null;

  usn:
    | number
    | string
    | null;

  updated_at: string | null;
  created_at: string | null;

  rb_local_deleted:
    | number
    | string
    | null;

  rb_local_synced:
    | number
    | string
    | null;

  rb_data_status:
    | number
    | string
    | null;

  rb_local_data_status:
    | number
    | string
    | null;
}

/**
 * Reads the next deterministic batch after the supplied
 * composite cursor:
 *
 *   (rb_local_usn, ID)
 *
 * The cursor is deliberately NOT persisted by this function.
 * Persistence happens only after the caller has successfully
 * processed the returned batch.
 */
export async function scanChangeBatch(
  db: SqliteDatabase,
  cursor: ChangeCursor | null,
  batchSize = 500,
): Promise<ChangeBatchResult> {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 5000
  ) {
    throw new Error(
      'batchSize must be an integer between 1 and 5000.',
    );
  }

  const rows = await all<CandidateRow>(
    db,
    `
      SELECT
        ID,
        UUID,
        rb_local_usn,
        usn,
        updated_at,
        created_at,
        rb_local_deleted,
        rb_local_synced,
        rb_data_status,
        rb_local_data_status
      FROM djmdContent
      WHERE rb_local_usn IS NOT NULL
        AND (
          ? IS NULL
          OR rb_local_usn > ?
          OR (
            rb_local_usn = ?
            AND ID > ?
          )
        )
      ORDER BY
        rb_local_usn ASC,
        ID ASC
      LIMIT ?
    `,
    [
      cursor?.rbLocalUsn ?? null,
      cursor?.rbLocalUsn ?? null,
      cursor?.rbLocalUsn ?? null,
      cursor?.id ?? '',
      batchSize + 1,
    ],
  );

  const hasMore =
    rows.length > batchSize;

  const pageRows = hasMore
    ? rows.slice(0, batchSize)
    : rows;

  const candidates =
    pageRows.map(toCandidate);

  let cursorAfter: ChangeCursor | null =
    cursor;

  const lastCandidate =
    candidates.at(-1);

  if (lastCandidate) {
    cursorAfter = {
      rbLocalUsn:
        lastCandidate.rbLocalUsn,
      id: lastCandidate.id,
    };
  }

  const deletedCount =
    candidates.filter(
      (candidate) =>
        candidate.rbLocalDeleted !== 0,
    ).length;

  return {
    schemaVersion: 2,
    generatedAt:
      new Date().toISOString(),

    cursorBefore: cursor,
    cursorAfter,

    batchSize,
    returned: candidates.length,
    hasMore,

    activeCount:
      candidates.length -
      deletedCount,

    deletedCount,

    candidates,
  };
}

function toCandidate(
  row: CandidateRow,
): ChangeCandidate {
  const rbLocalUsn =
    toNumber(row.rb_local_usn);

  if (rbLocalUsn === null) {
    throw new Error(
      `Unexpected NULL rb_local_usn for ` +
        `djmdContent.ID=${row.ID}`,
    );
  }

  return {
    id: row.ID,
    uuid: row.UUID,

    rbLocalUsn,

    usn: toNumber(row.usn),

    updatedAt: row.updated_at,
    createdAt: row.created_at,

    rbLocalDeleted:
      toNumber(
        row.rb_local_deleted,
      ) ?? 0,

    rbLocalSynced:
      toNumber(
        row.rb_local_synced,
      ) ?? 0,

    rbDataStatus:
      toNumber(
        row.rb_data_status,
      ),

    rbLocalDataStatus:
      toNumber(
        row.rb_local_data_status,
      ),
  };
}

function toNumber(
  value: unknown,
): number | null {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}