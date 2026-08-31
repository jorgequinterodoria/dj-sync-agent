# PHASE 41 — Intelligence Profiles Persistence · DJTrackProfiles

Fecha: 2026-08-28
Bloque: B · ENTREGA 02

## Objetivo

Persistir `TrackIntelligenceProfile` en `dj_track_profiles` por clave compuesta determinista:

```
(track_id, engine_version, profile_version, schema_version, audio_features_version, features_version
```

Esto permite recomputar perfiles solo cuando alguna entrada cambia (Bloque E: Intelligence v2. Lectura directa sin recalcular cada vez.

## Entregable

Puerto `LocalIntelligenceProfileStorePort`:

- `persistProfile({trackId, engineVersion, profileVersion, schemaVersion, audioFeaturesVersion, featuresVersion, profile})
- `getProfile(args mismos)` → `TrackIntelligenceProfile` (JSON parseado o null

## Condiciones de cierre ✅

- [x] Clave 6-uplet.
- [x] profile_json JSON 100% fidelity (deepEqual `bloque-b.test).
- [x] `getProfile con profileVersion que no existe → null.
- [x] Tests `bloque-b.test.ts pass.
- [x] Determinismo 100%: misma entrada → mismo profile_json (llave 6-uplet única).

Integrity preservado. Quality gates: typecheck 0 + 172 tests PASS.
