# PHASE 42 — Sync Runs · Idempotency + Recovery

Fecha: 2026-08-28
Bloque: B · ENTREGA 02

## Objetivo

Hacer ingesta sync incremental idempotente y recuperable. Cada run marcado start → success | error. rows_added, rows_updated, rows_deleted, error_message.

## Entregable

Puerto `LocalSyncRunStorePort`:

- `startRun(startedAt?): Promise<number>` (AUTOINCREMENT sync_run_id)
- `finishRun` success o error status + delta rows 0…
- `getLastSuccessfulRun()` para recovery point (último sync bueno)
- `getRun(id): Promise<SyncRunRow>`

## Condiciones de cierre ✅

- [x] Lifecycle start → success.
- [x] start → error message preserved.
- [x] `getLastSuccessfulRun` ignora runs error.
- [x] Preparado para integrar en Reliability (Fase 30 retry, circuit breaker, idempotency wrappers Bloque C sessions Bloque B integration test idempotent re-run same snapshot produce mismmo resultado
- [x] gates typecheck 0, 172 tests PASS.
