# PHASE 43 — copilot.db v2 · DJ History Schema (dj_sessions + tracks + transitions + feedback)

Fecha: 2026-08-28
Bloque: C · ENTREGA 03 (DJ Memory Local First)

## Objetivo

Extender copilot.db de SCHEMA_VERSION=1 a SCHEMA_VERSION=2 con 7 tablas nuevas de DJ Behavior Memory (histórico sessions+transitions+feedback + preferences + behavior profiles + conversations), manteniendo 8 tablas Bloque B intactas. Total 15 tablas STRICT con FK CASCADE y migración 0002 reversible.

## Arquitectura

Cambios aplicados en `src/core/local-store/`:

| Archivo | Propósito |
|---|---|
| `schema.ts` | `COPILOT_DB_SCHEMA_VERSION = 2`; 7 `DbTableDef` nuevas + 26 índices adicionales; helpers `BLOQUE_B_TABLE_NAMES`, `BLOQUE_C_TABLE_NAMES`, `COPILOT_DB_TABLES_BLOQUE_B/C`, `renderBlockBSchemaSql()`, `renderBlockCSchemaSql()`, `renderAllSchemaSql()` |
| `types.ts` | Nuevos row types: `DJSessionRow`, `DJSessionTrackRow`, `DJTransitionRow`, `RecommendationFeedbackRow`, `DJPreferenceRow`, `DJBehaviorProfileRow`, `CopilotConversationRow`. Alias `DJBehaviorProfileV1 = PersonalizedTrackProfile`. Helpers `packConversationSnapshot` / `unpackConversationSnapshot`. Type `DJSessionTrackFlags`. |
| `migrations/0001_initial.ts` | Split migraciones: `MIGRATION_0001` (solo Bloque B), `MIGRATION_0002` (solo Bloque C). `COPILOT_DB_MIGRATIONS = [MIGRATION_0001, MIGRATION_0002]`. |
| `schema.test.ts` | Refactor PHASE38 → validar 8 tablas Bloque B vía `COPILOT_DB_TABLES_BLOQUE_B` y `MIGRATION_0001` + schemaVersion actual 2. |
| `schema-v2.test.ts` (NUEVO) | Suite PHASE43: 15 tablas totales, migración 0002 id/version/lengths, renderAllSchemaSql 15 STRICT tables + 13+ índices, separación 0001 no incluye Bloque C / 0002 no incluye Bloque B. |

## 7 Tablas nuevas Bloque C (v2)

1. `dj_sessions` — PK `session_id` (started_at / ended_at / source / context_tag)
2. `dj_session_tracks` — PK compuesto `(session_id, position)` + FK a sessions ON DELETE CASCADE y tracks; `played_at`, `duration_played_ms`, `flags_json` (playedFull/skipped/cutShort)
3. `dj_transitions` — PK compuesto `(track_a_id, track_b_id)`; `frequency` rolling avg, `success_score` clamp 0..1 (4 decimals), `first_seen` / `last_seen`, durations promedio
4. `recommendation_feedback` — PK `rec_feedback_id` + FK `session_id` SET NULL y `track_id` CASCADE; booleans stored as INTEGER accepted/clicked_preview/added_to_set (0/1)
5. `dj_preferences` — PK `preference_id` AUTOINCREMENT; dimension/kind/value/source/weight ±/device_id/occurred_at. Preference normalization a lowercase.
6. `dj_behavior_profiles` — PK compuesto `(device_id, profile_version, schema_version, engine_version)`; `profile_json` = PersonalizedTrackProfile (100% fidelity)
7. `copilot_conversations` — PK `conversation_id`; `snapshot_json` = ConversationSnapshot completo (messages + constraints + summary).

## Condiciones de cierre ✅

- [x] `COPILOT_DB_SCHEMA_VERSION === 2`
- [x] 15 tablas totales (8 Bloque B + 7 Bloque C)
- [x] Todas 15 tablas STRICT
- [x] FK cascade: `dj_sessions → dj_session_tracks (CASCADE)`, `dj_session_tracks/transitions/feedback → normalized_tracks (CASCADE)`, `feedback.session_id → SET NULL`
- [x] Índices: session_id, track_id, (a+b) transitions, occurred_at, device+dimension+kind preferences, device+versions behavior, conversation_id UNIQUE
- [x] Migración 0002 separada con up/down reversibles
- [x] 0001 NO contiene tablas Bloque C / 0002 NO contiene tablas Bloque B
- [x] Suite `schema.test.ts` + `schema-v2.test.ts` PASS
- [x] Quality gates: `pnpm typecheck` exit 0 · `pnpm exec node --import tsx --test "src/**/*.test.ts"` 290/290 PASS

## Calidad

| Medida | Valor |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm exec node --import tsx --test "src/**/*.test.ts"` | 290 PASS, 0 FAIL |
| Strict Tables SQLite v2 | ✅ 15/15 |
| Índices totales (B+C) | ≥ 50 |
| Migraciones versionadas | 2 (0001 B + 0002 C) reversibles up/down |
| Split helpers Bloque B/C | `COPILOT_DB_TABLES_BLOQUE_B`, `COPILOT_DB_TABLES_BLOQUE_C`, `renderBlockB/CSchemaSql` |
