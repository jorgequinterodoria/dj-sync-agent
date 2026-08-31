import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BLOQUE_B_TABLE_NAMES, COPILOT_DB_TABLES_BLOQUE_B, renderBlockBSchemaSql } from './schema.js';
import { InMemoryCopilotDbStore } from './in-memory-store.js';
import { MIGRATION_0001 } from './migrations/0001_initial.js';

void describe('PHASE38 — copilot.db v1 Bloque B (8 tablas base)', () => {
  void it('Bloque B contiene 8 tablas base v1', () => {
    assert.equal(COPILOT_DB_TABLES_BLOQUE_B.length, 8);
    assert.deepEqual(COPILOT_DB_TABLES_BLOQUE_B.map((t) => t.name), BLOQUE_B_TABLE_NAMES);
    const names = COPILOT_DB_TABLES_BLOQUE_B.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'audio_analysis_results',
      'audio_features',
      'cues',
      'dj_track_profiles',
      'normalized_tracks',
      'playlist_entries',
      'playlists',
      'sync_runs',
    ].sort());
  });

  void it('MIGRATION_0001 id, versión 1 y statements up/down Bloque B', () => {
    assert.equal(MIGRATION_0001.id, '0001_initial_v1');
    assert.equal(MIGRATION_0001.version, 1);
    assert.ok(MIGRATION_0001.up.length >= COPILOT_DB_TABLES_BLOQUE_B.length, 'up crea tablas+indices Bloque B');
    assert.ok(MIGRATION_0001.down.length >= COPILOT_DB_TABLES_BLOQUE_B.length, 'down dropea tablas Bloque B');
  });

  void it('renderBlockBSchemaSql genera CREATE TABLE + CREATE INDEX Bloque B strict tables', () => {
    const stmts = renderBlockBSchemaSql();
    const createTables = stmts.filter((s) => s.startsWith('CREATE TABLE'));
    const createIndices = stmts.filter((s) => s.startsWith('CREATE INDEX') || s.startsWith('CREATE UNIQUE INDEX'));
    assert.equal(createTables.length, COPILOT_DB_TABLES_BLOQUE_B.length);
    const expectedIndicesCount = COPILOT_DB_TABLES_BLOQUE_B.reduce((acc, t) => acc + (t.indices?.length ?? 0), 0);
    assert.equal(createIndices.length, expectedIndicesCount);
    for (const table of COPILOT_DB_TABLES_BLOQUE_B) {
      const sql = createTables.find((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${table.name}`));
      assert.ok(sql, `missing create table for ${table.name}`);
      assert.ok(sql!.includes('STRICT'), `${table.name} should be STRICT`);
    }
  });

  void it('InMemoryCopilotDbStore exposes schemaVersion 2 (v2 BloqueB+C) y closeable', async () => {
    const store = new InMemoryCopilotDbStore();
    assert.equal(store.schemaVersion, 2);
    await store.close();
  });
});
