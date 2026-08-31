# PHASE 45 — DJBehaviorProfileStorePort · Profile determinista PersonalizedTrackProfile (semver)

Fecha: 2026-08-28
Bloque: C · ENTREGA 03 (DJ Memory Local First)

## Objetivo

Persistir perfiles de comportamiento deterministas en `dj_behavior_profiles` usando el contrato semantico `PersonalizedTrackProfile` (100% fidelity vía `profile_json` packed). PK compuesto (device, profileVersion, schemaVersion, engineVersion); `getLatestBehaviorProfile` retorna max profile_version para schema/engine dados.

## Ports (cambios resolución overloads Bloque B Intelli vs Bloque C Behavior)

Antes: `LocalIntelligenceProfileStorePort` y `LocalDJBehaviorProfileStorePort` ambos usaban `getProfile/persistProfile` nombre (incompatible extends interface en TS mismo name signature distintas).

Ahora nombres únicos ports.ts resueltos:

| Store | Interface | Nombre método persist | Nombre método get |
|---|---|---|---|
| Intelligence (Bloque B) | `LocalIntelligenceProfileStorePort` | `persistIntelligenceProfile` | `getIntelligenceProfile` |
| Behavior (Bloque C) | `LocalDJBehaviorProfileStorePort` | `persistBehaviorProfile` | `getBehaviorProfile` / `getLatestBehaviorProfile` |

Adapter InMemory actualizados y test bloque-b.test.ts refactorizado `persistIntelligenceProfile/getIntelligenceProfile` (PASS sin regresiones).

## Codec fidelity

En `codec.ts`:

- `toDJBehaviorProfileRow({ deviceId, profileVersion, schemaVersion, engineVersion, profile, computedAt?, now? })` → row con `profile_json = JSON.stringify(profile)`. `computed_at` = computedAt o isoNow(now). `created_at` / `updated_at` = isoNow.
- `unpackDJBehaviorProfile(row)` → retorna `JSON.parse(row.profile_json) as PersonalizedTrackProfile` exacto. 0 pérdida de campos.

## Implementación InMemory

En `in-memory-store.ts`:

- Bucket behaviorProfiles `Map<behaviorKey, DJBehaviorProfileRow>` donde `behaviorKey = \`${device}__${pv}__${sv}__${ev}\``
- `persistBehaviorProfile` upsert overwrite de updated_at pero preserva created_at cuando el row ya existía
- `getBehaviorProfile` key exacta
- `getLatestBehaviorProfile(deviceId, {schemaVersion?, engineVersion?})` → filtra candidates, ordena `row.profile_version desc, row.updated_at desc`, retorna first deserializeado. Default schemaVersion=1 engineVersion='1.0.0'.

## Tests bloque-c.test.ts

Escenario PASS determinismo:

1. buildPersonalizedTrackProfile 1 evento → profile version 1 → persist.
2. buildPersonalizedTrackProfile 2 eventos (mismo idem e2) → version 2 → persist.
3. `getBehaviorProfile(v1)` → evidence.totalEvents = 1 ✅
4. `getLatestBehaviorProfile(d1)` → evidence.totalEvents = 2 ✅ (retorna max profileVersion).
5. Misma entrada LearningEvent semánticamente igual = mismo profile_json (no random).

## Condiciones de cierre ✅

- [x] Resuelto overload name conflicts Intelli vs Behavior (renames unique)
- [x] Profile codecs round-trip 100% (asserts profile_json parseado deepEqual)
- [x] InMemory getLatest semántica max profileVersion correcta
- [x] Ports 9 métodos implementados completos `CopilotDbLocalStore`
- [x] Tests behavior profile PASS en bloque-c.test.ts
- [x] Sin regresiones Bloque B tests (bloque-b.test.ts persistIntelligenceProfile)
- [x] Gates finales: pnpm typecheck exit 0 · tests 290 PASS / 0 FAIL
