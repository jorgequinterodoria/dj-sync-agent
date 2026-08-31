import type { DbTableDef, DbIndexDef } from '../schema.js';
import { COPILOT_DB_TABLES, renderCreateTableSql, renderCreateIndexSql, COPILOT_DB_SCHEMA_VERSION, BLOQUE_C_TABLE_NAMES } from '../schema.js';

export const MIGRATION_0001_ID = '0001_initial_v1';
export const MIGRATION_0001_UP_STATEMENTS: string[] = buildInitialStatements();
export const MIGRATION_0001_DOWN_STATEMENTS: string[] = buildInitialDropStatements();

export const MIGRATION_0002_ID = '0002_dj_memory_v2';
export const MIGRATION_0002_UP_STATEMENTS: string[] = buildBlockCStatements();
export const MIGRATION_0002_DOWN_STATEMENTS: string[] = buildBlockCDropStatements();

export interface MigrationEntry {
  id: string;
  description: string;
  version: number;
  up: ReadonlyArray<string>;
  down: ReadonlyArray<string>;
}

export const MIGRATION_0001: MigrationEntry = {
  id: MIGRATION_0001_ID,
  description: 'Initial copilot.db schema with tracks, playlists, cues, audio analysis, audio features, dj_track_profiles, sync_runs.',
  version: 1,
  up: MIGRATION_0001_UP_STATEMENTS,
  down: MIGRATION_0001_DOWN_STATEMENTS,
};

export const MIGRATION_0002: MigrationEntry = {
  id: MIGRATION_0002_ID,
  description: 'DJ Memory schema: dj_sessions, dj_session_tracks, dj_transitions, recommendation_feedback, dj_preferences, dj_behavior_profiles, copilot_conversations.',
  version: 2,
  up: MIGRATION_0002_UP_STATEMENTS,
  down: MIGRATION_0002_DOWN_STATEMENTS,
};

export const COPILOT_DB_MIGRATIONS: MigrationEntry[] = [
  MIGRATION_0001,
  MIGRATION_0002,
];

function buildInitialStatements(): string[] {
  const stmts: string[] = [
    `PRAGMA foreign_keys = ON;`,
    `PRAGMA strict_tables = ON;`,
  ];
  for (const table of COPILOT_DB_TABLES) {
    if (BLOQUE_C_TABLE_NAMES.includes(table.name)) continue;
    stmts.push(renderCreateTableSql(table));
    for (const index of table.indices ?? []) {
      stmts.push(renderCreateIndexSql(index));
    }
  }
  return stmts;
}

function buildInitialDropStatements(): string[] {
  const drops: string[] = [];
  const initial = COPILOT_DB_TABLES.filter((t) => !BLOQUE_C_TABLE_NAMES.includes(t.name));
  for (let i = initial.length - 1; i >= 0; i -= 1) {
    const table = initial[i] as DbTableDef;
    for (const index of table.indices ?? []) {
      const idx = index as DbIndexDef;
      drops.push(`DROP INDEX IF EXISTS ${idx.name};`);
    }
    drops.push(`DROP TABLE IF EXISTS ${table.name};`);
  }
  return drops;
}

function buildBlockCStatements(): string[] {
  const stmts: string[] = [];
  for (const table of COPILOT_DB_TABLES) {
    if (!BLOQUE_C_TABLE_NAMES.includes(table.name)) continue;
    stmts.push(renderCreateTableSql(table));
    for (const index of table.indices ?? []) {
      stmts.push(renderCreateIndexSql(index));
    }
  }
  return stmts;
}

function buildBlockCDropStatements(): string[] {
  const drops: string[] = [];
  const blockC = COPILOT_DB_TABLES.filter((t) => BLOQUE_C_TABLE_NAMES.includes(t.name));
  for (let i = blockC.length - 1; i >= 0; i -= 1) {
    const table = blockC[i] as DbTableDef;
    for (const index of table.indices ?? []) {
      const idx = index as DbIndexDef;
      drops.push(`DROP INDEX IF EXISTS ${idx.name};`);
    }
    drops.push(`DROP TABLE IF EXISTS ${table.name};`);
  }
  return drops;
}

export const COPILOT_DB_SCHEMA_VERSION_LATEST = COPILOT_DB_SCHEMA_VERSION;
