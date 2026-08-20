import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { SqliteDatabase } from './sqlcipher.js';
import { all } from './sqlcipher.js';

export interface TableInfo {
  name: string;
  sql: string | null;
  columns: Array<{
    name: string;
    type: string;
    notNull: boolean;
    defaultValue: string | null;
    primaryKeyPosition: number;
  }>;
  indexes: Array<{
    name: string;
    unique: boolean;
    origin: string;
  }>;
}

export interface SchemaReport {
  database: {
    filename: string;
    sizeBytes: number;
    modifiedAt: string;
  };
  tableCount: number;
  tables: TableInfo[];
}

type TableRow = {
  name: string;
  sql: string | null;
};

type ColumnRow = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type IndexRow = {
  name: string;
  unique: number;
  origin: string;
};

export async function inspectSchema(db: SqliteDatabase, dbPath: string): Promise<SchemaReport> {
  const fileStats = await stat(dbPath);

  const tables = await all<TableRow>(
    db,
    `SELECT name, sql
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );

  const detailed: TableInfo[] = [];

  for (const table of tables) {
    const columns = await all<ColumnRow>(db, `PRAGMA table_info(${quoteIdentifier(table.name)})`);
    const indexes = await all<IndexRow>(db, `PRAGMA index_list(${quoteIdentifier(table.name)})`);

    detailed.push({
      name: table.name,
      sql: table.sql,
      columns: columns.map((column) => ({
        name: column.name,
        type: column.type,
        notNull: column.notnull === 1,
        defaultValue: column.dflt_value,
        primaryKeyPosition: column.pk,
      })),
      indexes: indexes.map((index) => ({
        name: index.name,
        unique: index.unique === 1,
        origin: index.origin,
      })),
    });
  }

  return {
    database: {
      filename: basename(dbPath),
      sizeBytes: fileStats.size,
      modifiedAt: fileStats.mtime.toISOString(),
    },
    tableCount: detailed.length,
    tables: detailed,
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
