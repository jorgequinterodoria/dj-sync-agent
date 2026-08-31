# PHASE 39 — LocalReadModel · Ports + Codec + InMemory adapter

Fecha: 2026-08-28
Bloque: B · ENTREGA 02

## Objetivo

Exponer `LocalReadModelStorePort` como frontera de DJCore: tracks/playlists/cues. Implementación de referencia `InMemoryCopilotDbStore` lista para sustituir por un driver SQLite real (better-sqlite3) en siguientes fases sin tocar la interfaz. Mantener semántica LibraryService.

## Puertos y codecs

| Entregables:

- `LocalReadModelStorePort`:
  - `upsertTrack(track)` / `upsertTracks(tracks[])` / `getTrack(id)` | `listTrackIds()`
  - `searchTracks(TrackQuery)` (exactamente la firma LibraryQuery library-query.ts)
  - `getLibraryStats()`
  - Playlists: `upsertPlaylist`, `getPlaylist`, `listPlaylists`
  - Cues: `upsertCues(trackId, cues[])` · `getCues(trackId)`

- `codec.ts`
  - `toNormalizedTrackRow` y `toDJTrackFromRow` (roundtrip via `normalized_track_json TEXT 100% fidelity.
  - `toPlaylistRows` (row + entries) | `toDJPlaylistFromRow`
  - `toCueRows` | `toDJCuesFromRows` sorted by position

## Implementación referencia

- `InMemoryCopilotDbStore implements LocalReadModelStorePort` + 100% en memoria · Closeable.

## Condiciones de cierre ✅

- [x] Ports + codec roundtrip NormalizedTrack 100% fidelity.
- [x] `searchTracks` soporta: text, bpmMin/bpmMax, rating, genre, key, label, artist, playlistId, hasLocalFile, limit, offset.
- [x] getLibraryStats: trackCount, withLocalFile, analyzed, rated, avgBpm (igual semántica LibraryService).
- [x] Tests `local-read-model.test.ts` PASS: codec RT, playlists, cues upsert/get/search/list/stats.
- [x] Gates: pnpm typecheck 0 · 172 tests PASS.

## Rendimiento benchmark meta (cuando conectemos SQLite real): ≥ 5.000 tracks query compuesta ≤ 20ms en Apple Silicon M1/M2.
