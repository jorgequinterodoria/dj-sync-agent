import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COPILOT_DB_MIGRATIONS } from './migrations/0001_initial.js';
import { BLOQUE_B_TABLE_NAMES, BLOQUE_C_TABLE_NAMES, COPILOT_DB_SCHEMA_VERSION, COPILOT_DB_TABLES, renderAllSchemaSql } from './schema.js';

void describe('PHASE43 — copilot.db v2 DJ Memory schema', () => {
  void it('schema v2 version 2 + 15 tables total (8 Bloque B + 7 Bloque C)', () => {
    assert.equal(COPILOT_DB_SCHEMA_VERSION, 2);
    assert.deepEqual(COPILOT_DB_TABLES.map((t) => t.name).slice(0, 8), BLOQUE_B_TABLE_NAMES);
    assert.deepEqual(COPILOT_DB_TABLES.map((t) => t.name).slice(8), BLOQUE_C_TABLE_NAMES);
    assert.equal(COPILOT_DB_TABLES.length, 15);
  });

  void it('migration 0001 + 0002 id, version and lengths match', () => {
    assert.equal(COPILOT_DB_MIGRATIONS.length, 2);
    const v1 = COPILOT_DB_MIGRATIONS[0]!;
    const v2 = COPILOT_DB_MIGRATIONS[1]!;
    assert.equal(v1.id, '0001_initial_v1');
    assert.equal(v1.version, 1);
    assert.equal(v2.id, '0002_dj_memory_v2');
    assert.equal(v2.version, 2);
    assert.ok(v1.up.length > 8, `v1 up tiene ${v1.up.length} statements`);
    assert.ok(v1.down.length > 8);
    assert.ok(v2.up.length >= 7 * 2, `v2 up tiene ${v2.up.length} statements (tablas+indices)`);
    assert.ok(v2.down.length >= 7);
  });

  void it('renderAllSchemaSql CREATE TABLE strict + indices incluye Bloque C', () => {
    const all = renderAllSchemaSql();
    const tables = all.filter((s) => s.startsWith('CREATE TABLE'));
    const indices = all.filter((s) => s.startsWith('CREATE INDEX') || s.startsWith('CREATE UNIQUE INDEX'));
    assert.equal(tables.length, 15);
    for (const stmt of tables) {
      assert.ok(stmt.endsWith(') STRICT;'), `table no strict: ${stmt.slice(0, 60)}`);
    }
    assert.ok(indices.length >= 13);
    const blockCTables = new Set(BLOQUE_C_TABLE_NAMES);
    for (const name of blockCTables) {
      const found = tables.some((stmt) => stmt.includes(` ${name} (`));
      assert.ok(found, `falta Bloque C tabla ${name}`);
    }
  });

  void it('0001 mig NO incluye tablas Bloque C, 0002 mig NO incluye tablas Bloque B', () => {
    for (const stmt of COPILOT_DB_MIGRATIONS[0]!.up) {
      for (const name of BLOQUE_C_TABLE_NAMES) {
        assert.ok(!stmt.includes(` ${name} (`) && !stmt.includes(`INTO ${name} `), `0001 incluye ${name}`);
      }
    }
    for (const stmt of COPILOT_DB_MIGRATIONS[1]!.up) {
      for (const name of BLOQUE_B_TABLE_NAMES) {
        assert.ok(!stmt.includes(` ${name} (`), `0002 incluye ${name} de B`);
      }
    }
    for (const stmt of COPILOT_DB_MIGRATIONS[1]!.down) {
      const allBlockC = BLOQUE_C_TABLE_NAMES.slice().reverse();
      void allBlockC;
    }
  });
});
