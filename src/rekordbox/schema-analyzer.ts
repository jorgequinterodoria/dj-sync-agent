import type { SqliteDatabase } from './sqlcipher.js';
import { all } from './sqlcipher.js';

export interface ForeignKeyInfo {
  id: number;
  sequence: number;
  table: string;
  from: string;
  to: string | null;
  onUpdate: string;
  onDelete: string;
  match: string;
}

export interface IndexColumnInfo {
  sequence: number;
  column: string | null;
  descending: boolean;
  collation: string | null;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: IndexColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKeyPosition: number;
  hidden: number;
}

export interface TableAnalysis {
  name: string;
  sql: string | null;
  rowCount: number | null;
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
}

export interface SchemaAnalysisReport {
  schemaVersion: 2;
  generatedAt: string;
  tables: TableAnalysis[];
  foreignKeyCount: number;
}

export interface SampleReport {
  generatedAt: string;
  samples: Record<string, unknown[]>;
}

interface TableRow { name: string; sql: string | null }
interface ColumnRow {
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
interface IndexRow { name: string; unique: number; origin: string; partial: number }
interface IndexInfoRow { seqno: number; cid: number; name: string | null; desc: number; coll: string | null }
interface CountRow { count: number }

type Primitive = string | number | boolean | null;

const SAMPLE_TABLES = [
  'djmdContent',
  'contentFile',
  'djmdArtist',
  'djmdAlbum',
  'djmdGenre',
  'djmdLabel',
  'djmdKey',
  'djmdCue',
  'contentCue',
  'djmdPlaylist',
  'djmdSongPlaylist',
  'djmdHistory',
  'djmdSongHistory',
  'djmdMyTag',
  'djmdSongMyTag',
  'djmdSongHotCueBanklist',
  'hotCueBanklistCue',
] as const;

export async function analyzeSchema(db: SqliteDatabase): Promise<SchemaAnalysisReport> {
  const tables = await all<TableRow>(
    db,
    `SELECT name, sql
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );

  const result: TableAnalysis[] = [];
  let foreignKeyCount = 0;

  for (const table of tables) {
    const name = quoteIdentifier(table.name);
    const columns = await all<ColumnRow>(db, `PRAGMA table_xinfo(${name})`);
    const foreignKeys = await all<ForeignKeyRow>(db, `PRAGMA foreign_key_list(${name})`);
    const indexes = await all<IndexRow>(db, `PRAGMA index_list(${name})`);
    const analyzedIndexes: IndexInfo[] = [];

    for (const index of indexes) {
      const indexColumns = await all<IndexInfoRow>(
        db,
        `PRAGMA index_xinfo(${quoteIdentifier(index.name)})`,
      );

      analyzedIndexes.push({
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

    let rowCount: number | null = null;
    try {
      const count = await all<CountRow>(db, `SELECT COUNT(*) AS count FROM ${name}`);
      rowCount = Number(count[0]?.count ?? 0);
    } catch {
      rowCount = null;
    }

    const normalizedColumns = columns.map((column) => ({
      name: column.name,
      type: column.type,
      notNull: column.notnull === 1,
      defaultValue: column.dflt_value,
      primaryKeyPosition: column.pk,
      hidden: column.hidden ?? 0,
    }));

    const normalizedForeignKeys = foreignKeys.map((fk) => ({
      id: fk.id,
      sequence: fk.seq,
      table: fk.table,
      from: fk.from,
      to: fk.to,
      onUpdate: fk.on_update,
      onDelete: fk.on_delete,
      match: fk.match,
    }));

    foreignKeyCount += normalizedForeignKeys.length;

    result.push({
      name: table.name,
      sql: table.sql,
      rowCount,
      columns: normalizedColumns,
      primaryKey: normalizedColumns
        .filter((column) => column.primaryKeyPosition > 0)
        .sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition)
        .map((column) => column.name),
      foreignKeys: normalizedForeignKeys,
      indexes: analyzedIndexes,
    });
  }

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    tables: result,
    foreignKeyCount,
  };
}

export async function sampleImportantTables(db: SqliteDatabase): Promise<SampleReport> {
  const existingTables = new Set(
    (await all<TableRow>(
      db,
      `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )).map((table) => table.name),
  );

  const samples: Record<string, unknown[]> = {};

  for (const table of SAMPLE_TABLES) {
    if (!existingTables.has(table)) continue;

    const rows = await all<Record<string, unknown>>(
      db,
      `SELECT * FROM ${quoteIdentifier(table)} LIMIT 5`,
    );

    samples[table] = rows.map((row) => sanitizeRow(row));
  }

  return {
    generatedAt: new Date().toISOString(),
    samples,
  };
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

  if (Buffer.isBuffer(value)) {
    return `[BLOB ${value.byteLength} bytes]`;
  }

  if (value instanceof Uint8Array) {
    return `[BLOB ${value.byteLength} bytes]`;
  }

  return String(value);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
