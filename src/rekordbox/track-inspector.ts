import type { SqliteDatabase } from './sqlcipher.js';
import { all } from './sqlcipher.js';

const TARGET_TABLES = [
  'djmdContent',
  'contentFile',
  'djmdArtist',
  'djmdAlbum',
  'djmdGenre',
  'djmdKey',
  'djmdLabel',
  'djmdPlaylist',
  'djmdSongPlaylist',
  'djmdCue',
  'contentCue',
  'djmdMixerParam',
  'djmdMyTag',
  'djmdSongMyTag',
  'djmdSongHotCueBanklist',
  'hotCueBanklistCue',
] as const;

const SAMPLE_LIMIT = 5;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

type Primitive = string | number | boolean | null;

interface TableInfoRow {
  name: string;
  sql: string | null;
}

interface ColumnRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
  hidden?: number;
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
  match: string;
}

interface IndexRow {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexColumnRow {
  seqno: number;
  cid: number;
  name: string | null;
  desc: number;
  coll: string | null;
}

interface CountRow {
  count: number;
}

export interface TrackTableInspection {
  table: string;
  rowCount: number;
  primaryKey: string[];
  columns: Array<{
    cid: number;
    name: string;
    type: string;
    notNull: boolean;
    defaultValue: string | null;
    primaryKeyPosition: number;
    hidden: number;
  }>;
  indexes: Array<{
    name: string;
    unique: boolean;
    origin: string;
    partial: boolean;
    columns: Array<{
      sequence: number;
      column: string | null;
      descending: boolean;
      collation: string | null;
    }>;
  }>;
  declaredForeignKeys: Array<{
    id: number;
    sequence: number;
    table: string;
    from: string;
    to: string | null;
    onUpdate: string;
    onDelete: string;
    match: string;
  }>;
  sampleRows: Record<string, Primitive>[];
}

export interface TrackInspectionReport {
  schemaVersion: 3;
  generatedAt: string;
  sampleLimit: number;
  tables: TrackTableInspection[];
}

export async function inspectTrackTables(db: SqliteDatabase): Promise<TrackInspectionReport> {
  const existingTables = new Set(
    (await all<TableInfoRow>(
      db,
      `SELECT name, sql
       FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'`,
    )).map((table) => table.name),
  );

  const tables: TrackTableInspection[] = [];

  for (const table of TARGET_TABLES) {
    if (!existingTables.has(table)) continue;

    const quotedTable = quoteIdentifier(table);
    const columns = await all<ColumnRow>(db, `PRAGMA table_xinfo(${quotedTable})`);
    const indexes = await all<IndexRow>(db, `PRAGMA index_list(${quotedTable})`);
    const declaredForeignKeys = await all<ForeignKeyRow>(db, `PRAGMA foreign_key_list(${quotedTable})`);
    const count = await all<CountRow>(db, `SELECT COUNT(*) AS count FROM ${quotedTable}`);
    const sampleRows = await all<Record<string, unknown>>(
      db,
      `SELECT * FROM ${quotedTable} LIMIT ${SAMPLE_LIMIT}`,
    );

    const normalizedIndexes = [] as TrackTableInspection['indexes'];
    for (const index of indexes) {
      const indexName = quoteIdentifier(index.name);
      const indexColumns = await all<IndexColumnRow>(
        db,
        `PRAGMA index_xinfo(${indexName})`,
      );

      normalizedIndexes.push({
        name: index.name,
        unique: index.unique === 1,
        origin: index.origin,
        partial: index.partial === 1,
        columns: indexColumns
          .filter((column) => column.seqno >= 0)
          .map((column) => ({
            sequence: column.seqno,
            column: column.name,
            descending: column.desc === 1,
            collation: column.coll,
          })),
      });
    }

    const normalizedColumns = columns.map((column) => ({
      cid: column.cid,
      name: column.name,
      type: column.type,
      notNull: column.notnull === 1,
      defaultValue: column.dflt_value,
      primaryKeyPosition: column.pk,
      hidden: column.hidden ?? 0,
    }));

    tables.push({
      table,
      rowCount: Number(count[0]?.count ?? 0),
      primaryKey: normalizedColumns
        .filter((column) => column.primaryKeyPosition > 0)
        .sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition)
        .map((column) => column.name),
      columns: normalizedColumns,
      indexes: normalizedIndexes,
      declaredForeignKeys: declaredForeignKeys.map((fk) => ({
        id: fk.id,
        sequence: fk.seq,
        table: fk.table,
        from: fk.from,
        to: fk.to,
        onUpdate: fk.on_update,
        onDelete: fk.on_delete,
        match: fk.match,
      })),
      sampleRows: sampleRows.map(sanitizeRow),
    });
  }

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    sampleLimit: SAMPLE_LIMIT,
    tables,
  };
}

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sanitizeRow(row: Record<string, unknown>): Record<string, Primitive> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeValue(value)]),
  );
}

function sanitizeValue(value: unknown): Primitive {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
    return value;
  }

  if (Buffer.isBuffer(value)) return `[BLOB ${value.byteLength} bytes]`;
  if (value instanceof Uint8Array) return `[BLOB ${value.byteLength} bytes]`;
  return String(value);
}
