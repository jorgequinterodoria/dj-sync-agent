# PHASE 38 — copilot.db · Schema v1 & Migrations

Fecha: 2026-08-28
Bloque: B · ENTREGA 02 (Local Data Layer)

## Objetivo

Definir el esquema versionado de `copilot.db` (SQLite local en `~/.config/dj-sync-agent/copilot.db`) como Read Model independiente de Rekordbox y opcionalmente sincronizable con Supabase. 8 tablas + FKs estrictas (STRICT tables).

## Arquitectura

Archivos creados:

| Archivo | Propósito |
|---|---|
| `src/core/local-store/types.ts` | 8 interfaces de fila (`NormalizedTrackRow`, `PlaylistRow`, `PlaylistEntryRow`, `CueRow`, `AudioAnalysisResultRow`, `AudioFeaturesRow`, `DJTrackProfileRow`, `SyncRunRow`) |
| `src/core/local-store/schema.ts` | Definiciones declarativas 8 tablas + 30 índices; funciones `renderCreateTableSql` STRICT`, `renderAllSchemaSql`; `COPILOT_DB_SCHEMA_VERSION = 1` |
| `src/core/local-store/migrations/0001_initial.ts` | `MIGRATION_0001_UP_STATEMENTS` y `MIGRATION_0001_DOWN_STATEMENTS` + array versionado `COPILOT_DB_MIGRATIONS` |
| `src/core/local-store/index.ts` | Reexport types/schema/ports/codec/in-memory-store/migrations |

## Tablas v1

1. `normalized_tracks` — PK `track_id`
2. `playlists` — PK `playlist_id`
3. `playlist_entries` — PK compuesto (playlist_id, track_id, track_no) + FK cascade
4. `cues` — PK `cue_id` + FK a tracks
5. `audio_analysis_results` — PK run_id+track_id · metadata ffprobe
6. `audio_features` — PK track+schema+analyzer · preparado Bloque D TrackAudioFeaturesV1
7. `dj_track_profiles` — PK compuesta (track, engine, profile_v, schema_v, audio_features_v, features_v · IntelligenceProfile
8. `sync_runs` — sync_run_id AUTOINCREMENT · recovery incremental Fase42

## Condiciones de cierre ✅

- [x] 8 tablas en `COPILOT_DB_TABLES.length === 8
- [x] Todas las tablas son `STRICT` (validado por schema.renderCreateTableSql adds STRICT)
- [x] Índices por performance: bpm, key, genre, artist, composite(bpm,key,genre,artist), local_path
- [x] Migración 0001 versionada en array + down para rollback
- [x] Ports + Tests `schema.test.ts` PASS
- [x] Quality gates: pnpm typecheck exit 0 · pnpm test 172/172

## Calidad

| Medida | Valor |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 172 PASS |
| Strict Tables SQLite | ✅ 8/8 |
| Índices | 30 |
| Migraciones | up/down 1 |
