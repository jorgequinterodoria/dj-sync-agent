import type { SqliteDatabase } from '../rekordbox/sqlcipher.js';
import { all } from '../rekordbox/sqlcipher.js';

export interface ChangeStateReport {
  schemaVersion: 1;
  generatedAt: string;
  elapsedMs: number;
  database: {
    contentRows: number;
    activeRows: number;
    deletedRows: number;
  };
  rbLocalUsn: {
    populatedRows: number;
    nullRows: number;
    distinctValues: number;
    min: number | null;
    max: number | null;
    duplicateValueCount: number;
    duplicateRows: number;
  };
  usn: {
    populatedRows: number;
    nullRows: number;
    distinctValues: number;
    min: number | null;
    max: number | null;
    duplicateValueCount: number;
    duplicateRows: number;
  };
  timestamps: {
    createdAtNullRows: number;
    updatedAtNullRows: number;
    minCreatedAt: string | null;
    maxCreatedAt: string | null;
    minUpdatedAt: string | null;
    maxUpdatedAt: string | null;
  };
  statuses: {
    rbLocalDeleted: Record<string, number>;
    rbLocalSynced: Record<string, number>;
    rbDataStatus: Record<string, number>;
    rbLocalDataStatus: Record<string, number>;
  };
  consistencyChecks: {
    sameUsnDifferentUpdatedAtRows: number;
    sameRbLocalUsnDifferentUpdatedAtRows: number;
    activeRowsWithNullUpdatedAt: number;
    activeRowsWithNullRbLocalUsn: number;
  };
}

interface CountRow {
  count: number | string;
}

interface ScalarRow {
  value: number | string | null;
}

interface RangeRow {
  minValue: number | string | null;
  maxValue: number | string | null;
  populated: number | string;
  nullCount: number | string;
  distinctCount: number | string;
}

interface DuplicateRow {
  duplicateValueCount: number | string;
  duplicateRows: number | string;
}

interface StatusRow {
  value: number | string | null;
  count: number | string;
}

interface TimestampRow {
  minValue: string | null;
  maxValue: string | null;
}

async function count(
  db: SqliteDatabase,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const rows = await all<CountRow>(db, sql, params);
  return toNumber(rows[0]?.count) ?? 0;
}

async function scalar(
  db: SqliteDatabase,
  sql: string,
  params: unknown[] = [],
): Promise<number | null> {
  const rows = await all<ScalarRow>(db, sql, params);
  return toNumber(rows[0]?.value);
}

async function range(
  db: SqliteDatabase,
  column: string,
): Promise<RangeRow> {
  const rows = await all<RangeRow>(
    db,
    `
      SELECT
        MIN("${column}") AS minValue,
        MAX("${column}") AS maxValue,
        COUNT("${column}") AS populated,
        COUNT(*) - COUNT("${column}") AS nullCount,
        COUNT(DISTINCT "${column}") AS distinctCount
      FROM djmdContent
    `,
  );

  const row = rows[0];

  return {
    minValue: row?.minValue ?? null,
    maxValue: row?.maxValue ?? null,
    populated: row?.populated ?? 0,
    nullCount: row?.nullCount ?? 0,
    distinctCount: row?.distinctCount ?? 0,
  };
}

async function duplicates(
  db: SqliteDatabase,
  column: string,
): Promise<DuplicateRow> {
  const rows = await all<DuplicateRow>(
    db,
    `
      SELECT
        COUNT(*) AS duplicateValueCount,
        COALESCE(SUM(cnt), 0) AS duplicateRows
      FROM (
        SELECT "${column}", COUNT(*) AS cnt
        FROM djmdContent
        WHERE "${column}" IS NOT NULL
        GROUP BY "${column}"
        HAVING COUNT(*) > 1
      )
    `,
  );

  return {
    duplicateValueCount: rows[0]?.duplicateValueCount ?? 0,
    duplicateRows: rows[0]?.duplicateRows ?? 0,
  };
}

async function statusDistribution(
  db: SqliteDatabase,
  column: string,
): Promise<Record<string, number>> {
  const rows = await all<StatusRow>(
    db,
    `
      SELECT
        "${column}" AS value,
        COUNT(*) AS count
      FROM djmdContent
      GROUP BY "${column}"
      ORDER BY "${column}"
    `,
  );

  const result: Record<string, number> = {};

  for (const row of rows) {
    const key = row.value === null ? 'NULL' : String(row.value);
    result[key] = toNumber(row.count) ?? 0;
  }

  return result;
}

async function timestampRange(
  db: SqliteDatabase,
  column: string,
): Promise<TimestampRow> {
  const rows = await all<TimestampRow>(
    db,
    `
      SELECT
        MIN("${column}") AS minValue,
        MAX("${column}") AS maxValue
      FROM djmdContent
    `,
  );

  return {
    minValue: rows[0]?.minValue ?? null,
    maxValue: rows[0]?.maxValue ?? null,
  };
}

export async function inspectChangeState(
  db: SqliteDatabase,
): Promise<ChangeStateReport> {
  const startedAt = performance.now();
  const generatedAt = new Date().toISOString();

  console.log('Change-state inspection: reading djmdContent...');

  const contentRows = await count(
    db,
    'SELECT COUNT(*) AS count FROM djmdContent',
  );

  const deletedRows = await count(
    db,
    `SELECT COUNT(*) AS count FROM djmdContent WHERE COALESCE(rb_local_deleted, 0) <> 0`,
  );

  const activeRows = contentRows - deletedRows;

  console.log(`  contentRows=${contentRows}`);
  console.log(`  activeRows=${activeRows}`);
  console.log(`  deletedRows=${deletedRows}`);

  console.log('Change-state inspection: rb_local_usn...');
  const rbLocalUsn = await range(db, 'rb_local_usn');
  const rbLocalUsnDuplicates = await duplicates(db, 'rb_local_usn');

  console.log('Change-state inspection: usn...');
  const usn = await range(db, 'usn');
  const usnDuplicates = await duplicates(db, 'usn');

  console.log('Change-state inspection: timestamps...');
  const createdAt = await timestampRange(db, 'created_at');
  const updatedAt = await timestampRange(db, 'updated_at');

  const createdAtNullRows = await count(
    db,
    'SELECT COUNT(*) AS count FROM djmdContent WHERE created_at IS NULL',
  );

  const updatedAtNullRows = await count(
    db,
    'SELECT COUNT(*) AS count FROM djmdContent WHERE updated_at IS NULL',
  );

  const activeRowsWithNullUpdatedAt = await count(
    db,
    `SELECT COUNT(*) AS count FROM djmdContent WHERE COALESCE(rb_local_deleted, 0) = 0 AND updated_at IS NULL`,
  );

  const activeRowsWithNullRbLocalUsn = await count(
    db,
    `SELECT COUNT(*) AS count FROM djmdContent WHERE COALESCE(rb_local_deleted, 0) = 0 AND rb_local_usn IS NULL`,
  );

  console.log('Change-state inspection: consistency checks...');

  const sameUsnDifferentUpdatedAtRows = await count(
    db,
    `
      SELECT COUNT(*) AS count
      FROM djmdContent c
      JOIN (
        SELECT usn
        FROM djmdContent
        WHERE usn IS NOT NULL
        GROUP BY usn
        HAVING COUNT(DISTINCT COALESCE(updated_at, '')) > 1
      ) d
        ON d.usn = c.usn
    `,
  );

  const sameRbLocalUsnDifferentUpdatedAtRows = await count(
    db,
    `
      SELECT COUNT(*) AS count
      FROM djmdContent c
      JOIN (
        SELECT rb_local_usn
        FROM djmdContent
        WHERE rb_local_usn IS NOT NULL
        GROUP BY rb_local_usn
        HAVING COUNT(DISTINCT COALESCE(updated_at, '')) > 1
      ) d
        ON d.rb_local_usn = c.rb_local_usn
    `,
  );

  console.log('Change-state inspection: status distributions...');

  const statuses = {
    rbLocalDeleted: await statusDistribution(db, 'rb_local_deleted'),
    rbLocalSynced: await statusDistribution(db, 'rb_local_synced'),
    rbDataStatus: await statusDistribution(db, 'rb_data_status'),
    rbLocalDataStatus: await statusDistribution(db, 'rb_local_data_status'),
  };

  return {
    schemaVersion: 1,
    generatedAt,
    elapsedMs: Math.round(performance.now() - startedAt),
    database: {
      contentRows,
      activeRows,
      deletedRows,
    },
    rbLocalUsn: {
      populatedRows: toNumber(rbLocalUsn.populated) ?? 0,
      nullRows: toNumber(rbLocalUsn.nullCount) ?? 0,
      distinctValues: toNumber(rbLocalUsn.distinctCount) ?? 0,
      min: toNumber(rbLocalUsn.minValue),
      max: toNumber(rbLocalUsn.maxValue),
      duplicateValueCount: toNumber(rbLocalUsnDuplicates.duplicateValueCount) ?? 0,
      duplicateRows: toNumber(rbLocalUsnDuplicates.duplicateRows) ?? 0,
    },
    usn: {
      populatedRows: toNumber(usn.populated) ?? 0,
      nullRows: toNumber(usn.nullCount) ?? 0,
      distinctValues: toNumber(usn.distinctCount) ?? 0,
      min: toNumber(usn.minValue),
      max: toNumber(usn.maxValue),
      duplicateValueCount: toNumber(usnDuplicates.duplicateValueCount) ?? 0,
      duplicateRows: toNumber(usnDuplicates.duplicateRows) ?? 0,
    },
    timestamps: {
      createdAtNullRows,
      updatedAtNullRows,
      minCreatedAt: createdAt.minValue,
      maxCreatedAt: createdAt.maxValue,
      minUpdatedAt: updatedAt.minValue,
      maxUpdatedAt: updatedAt.maxValue,
    },
    statuses,
    consistencyChecks: {
      sameUsnDifferentUpdatedAtRows,
      sameRbLocalUsnDifferentUpdatedAtRows,
      activeRowsWithNullUpdatedAt,
      activeRowsWithNullRbLocalUsn,
    },
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
