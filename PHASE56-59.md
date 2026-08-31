# PHASE56-59 · Entrega 06 · Bloque F · LiveDJ Context (Now Playing + Live Context + Slot-aware Recommendations + Energy Curve)

> **Fecha cierre**: 28-08-2026
> **Estado**: ✅ CERRADA
> **Rama**: `feat/audio-analysis-boundary`
> **Tests final Bloque F (single-file)**: 9 PASS / 0 FAIL
> **Tests final full suite**: 315 PASS / 0 FAIL (monotónico, baseline Entrega05 Bloque E = 306, +9 neto)
> **Typecheck**: exit 0
> **Constraint user NO cumplimiento**: 0 Electron UI changes · 0 Rekordbox master.db writes · 0 Supabase requerido · RecommendationEngine intact (no reemplazado)

---

## 1. Acceptance Criteria Checklist (CERRADOS ✅)

| Fase | Nombre | Objetivo | Estado | Evidencia |
|---|---|---|---|---|
| **F56** | **Now Playing Detector Port** | `NowPlayingSourcePort` interface 14 campos `LiveNowPlaying`. Implementación `ManualNowPlayingSource` (pushTrack/tickElapsed/clear). Implementación `RekordboxActiveCuePollingSource` STUB SAFE 0 writes, 0 SQL, retorna null siempre. 2 tests. | ✅ PASS 2/2 | `src/core/live/now-playing-port.ts` · F56.1 pushTick elapsed clamp 5.5ms ✅ · F56.2 stub safe readonly null ✅ |
| **F57** | **LiveDJContext Service + checkpoint 30s** | `LiveDJContextService` state: sessionId, startedAt, currentNowPlaying, recentPlayedTrackIds[], derivedContextTag (opening/warmup/build/peak/afterhours/closing/unknown), currentSlot ('next_up'|'after_next'|'cool_down'), playedTracksCount, elapsedSessionMs, energyTimeline. `tick(dtMs, now?)` consulta source, actualiza elapsed, detecta cambio track → appendPlayedTrack previo. `checkpoint(now?)` salva JSON `LiveDJContextCheckpoint` schemaVersion:1 via `LiveDJCheckpointPort` (InMemory impl). Auto-checkpoint cada 30s default. 3 tests. | ✅ PASS 3/3 | `src/core/live/live-dj-context-state.ts` · F57.1 tick elapsed + playedCount (0.37ms) ✅ · F57.2 checkpoint persistence (0.11ms) ✅ · F57.3 deriveContextTag warmup/peak/closing target-2 (0.06ms) ✅ |
| **F58** | **Recommendations live slot-aware (hard constraints)** | `recommendLive(ctx, slot='next_up', candidates, ... preferenceSignals?, contextTagOverride?, recentTrackIdsForExclusion?, recentArtistNamesForExclusion?, limit, deviceId, currentTrack?)`. Ranges BPM: next_up -8/+8, after_next -10/+10, cool_down -12/-2. Ranges Energy: cool_down max=actual-0.02, min=actual-0.25; next_up -0.10/+0.12. Exclusiones hard: merge `recentTrackIdsForExclusion` param + `ctx.recentPlayedTrackIds` + `constraints.excludeTrackIds` (current track). Merge `recentArtistNamesForExclusion` → `excludeArtistNames`. Reuse `applyPreferenceConstraints` F54 (Bloque E) con `effectiveTag = override | derived`. `filterCandidatesByEnergyRange` hard filter previo engine. 2 tests. | ✅ PASS 2/2 | `src/core/live/live-recommend.ts` · F58.1 cool_down filtra high energy (0.92 y 0.87 > 0.84) candidateCount=2 (1.44ms) ✅ · F58.2 next_up excluye `recentTrackIdsForExclusion=['recent-repeat']` (0.57ms) ✅ appliedConstraints.excludeTrackIds=["t-now","recent-repeat"] |
| **F59** | **Live Energy Curve Tracker V1** | `buildPlannedEnergyCurve({totalDurationMinutes=60, samples=24})` 7 stages: opening(0.55)→warmup(0.70)→build(0.80)→peak(0.88)→bridge(0.80)→cooldown(0.65)→closing(0.40). Progress milestones: warmupEnd=0.2, buildEnd=0.5, peakEnd=0.85. `LiveEnergyCurveTracker`: `appendSnapshot(snap)`, `getMilestones()`, `summarizeDeviation(now?)` threshold 0.25 warning 'deviation_threshold_exceeded'. `adjustConstraintsForDeviation(baseConstraints)`: actual_below_planned → targetEnergy+0.05; actual_above_planned → targetEnergy-0.05. 2 tests. | ✅ PASS 2/2 | `src/core/live/live-energy-curve-tracker.ts` · F59.1 build 60min stages average=0.69 (0.66ms) ✅ · F59.2 milestones warmup_end@0.20 + peak_start@0.49 (1.06ms) ✅ |

---

## 2. Decisiones Técnicas Importantes

### 2.1 Ports & Adapters Pattern (Hexagonal) Live
- **NowPlayingSourcePort**: interface abstracta. `ManualNowPlayingSource` (tests/debug) · `RekordboxActiveCuePollingSource` (STUB safe, 0 writes). Cuando añadamos driver better-sqlite3 + ActiveCue tabla real en Rekordbox, solo cambiamos el adapter, NO cambiamos LiveDJContextService.
- **LiveDJCheckpointPort**: `InMemoryLiveDJCheckpointStore` (tests/runtime default). En el futuro, adapter SQLite → `LiveDJCheckpointSqliteStore` usa misma interfaz, sin tocar domain.

### 2.2 Bug Fix F58.2: Exclusiones recentTracks NO en constraints
**Root cause** (diagnóstico reproducido en tests):
- `recentTrackIdsForExclusion` y `ctx.recentPlayedTrackIds` solo se asignaban al campo `base.recentTrackIds` del `RecommendationContext`.
- El RecommendationEngine NO mergea automáticamente `context.recentTrackIds` en `constraints.excludeTrackIds` (solo excluye currentNowPlaying track).
- Resultado: `appliedConstraints.excludeTrackIds=["t-now"]` pero FALTABA `recent-repeat`.

**Fix aplicado** (verificado 9/9 tests PASS):
```typescript
// Paso 1: Merge AMBOS arrays (antes ?? = OR, ahora Set merge)
const recentTracksMerged = new Set<string>();
for (const id of (input.recentTrackIdsForExclusion ?? [])) recentTracksMerged.add(id.trim());
for (const id of (input.ctx.recentPlayedTrackIds ?? [])) recentTracksMerged.add(id.trim());
const recentTracks = [...recentTracksMerged];

// Paso 2: Mergear en constraints.excludeTrackIds ANTES de engine.recommend(base)
const excludeTrackIdsSet = new Set<string>(constraints.excludeTrackIds ?? []);
for (const id of recentTracks) excludeTrackIdsSet.add(id);
const finalConstraints: RecommendationConstraints = { ...constraints };
if (excludeTrackIdsSet.size > 0) finalConstraints.excludeTrackIds = [...excludeTrackIdsSet];
if (recentArtists.length > 0) finalConstraints.excludeArtistNames = recentArtists;
base = { ...base, constraints: finalConstraints };
```

### 2.3 Slot Ranges BPM / Energy (HARD constraints)
| Slot | BPM min delta | BPM max delta | Energy min delta | Energy max delta |
|---|---:|---:|---:|---:|
| `next_up` | -8 | +8 | -0.10 | +0.12 |
| `after_next` | -10 | +10 | -0.15 | +0.18 |
| `cool_down` | **-12** | **-2** | **-0.25** | **actual - 0.02** |

- cool_down BPM: rangos negativos estricto = **solo tracks con BPM menor o igual al actual - 2** (no permite igual al actual).
- cool_down Energy: `maxEnergy01 = currentEnergy01 - 0.02` (nunca supera la actual, baja energía). `targetEnergy` (si cool_down) = `maxEnergy01 - 0.05` (apunta 5 puntos más abajo que el máximo permitido).

### 2.4 deriveContextTagFromCurrentEnergy heurística
Reglas detalladas en `live-dj-context-state.ts` L73-120:
- `playedCount >= totalTargetTracks - 2` → **closing** (últimas 2 canciones).
- `elapsedMs >= 3h` AND `energy <= 0.45` → **afterhours**.
- `playedCount === 0` → **opening**.
- `energy < 0.58` → **warmup**.
- `energy > 0.62` → **peak**.
- `energy between 0.58 and 0.62` → **build**.
- Default → **unknown**.

### 2.5 Rekordbox ActiveCue Polling Stub SEGURO
```typescript
export class RekordboxActiveCuePollingSource implements NowPlayingSourcePort {
  public readonly sourceType = 'rekordbox_active_cue_polling' as const;
  constructor(options: { masterDbPath?: string|null; pollingIntervalMs?: number }) {}
  async getCurrent(): Promise<LiveNowPlaying | null> {
    if (!this.masterDbPath) return null;
    // TODO(Future): better-sqlite3 driver + SELECT * FROM ActiveCue LIMIT 1
    // ZERO SQL, ZERO WRITES en la implementación actual. STUB SAFE.
    return null;
  }
}
```
Cumplimiento constraint user: **NO escritura Rekordbox sin Approval 2FA**.

---

## 3. Archivos Creados / Modificados

### Nuevos (carpeta `src/core/live/` creada Bloque F)
| Archivo | Descripción | Líneas aprox |
|---|---|---:|
| [`now-playing-port.ts`](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/live/now-playing-port.ts) | LiveNowPlaying type + NowPlayingSourcePort interface · ManualNowPlayingSource impl · Rekordbox stub safe · helpers | ~297 |
| [`live-dj-context-state.ts`](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/live/live-dj-context-state.ts) | LiveSlot, LiveDJContextCheckpoint (schemaVersion:1), LiveDJCheckpointPort, InMemoryLiveDJCheckpointStore, LiveDJContextService, deriveContextTag/BPM/EnergyRange helpers | ~392 |
| [`live-recommend.ts`](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/live/live-recommend.ts) | buildCurrentTrackCandidateFromLiveNowPlaying, buildLiveSlotConstraints, filterCandidatesByEnergyRange, recommendLive (slot-aware constraints merge exclusion hard), mergeLiveRecommendationBatches | ~192 |
| [`live-energy-curve-tracker.ts`](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/live/live-energy-curve-tracker.ts) | LIVE_ENERGY_CURVE_V1_PROGRESS milestones, buildPlannedEnergyCurve 60min/24samples, averageEnergy01, LiveEnergyCurveTracker class (appendSnapshot/getMilestones/summarizeDeviation/adjustConstraintsForDeviation) | ~287 |
| [`live-dj.test.ts`](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/live/live-dj.test.ts) | 9 subtests Bloque F: F56.1/F56.2 · F57.1/F57.2/F57.3 · F58.1/F58.2 · F59.1/F59.2 | ~233 |

### Modificados
| Archivo | Cambio |
|---|---|
| `ROADMAP.md` | Bloque F 🔴→🟢 · Entrega 06 marcada ✅ CERRADA · Tests count §7 306→315 · LIVE CONTEXT §0 20%→100% · Detalle tabla fases F56-F59 añadidas. |
| `CONTINUITY.md` | §1 Último state gates 306→315 · §3 tabla REALIZADOS add Entrega06 Bloque F · §3 detalle Phases Bloque F · §4 FALTANTES renumera 1→3 (Bloque G→A) · §8 Links actualiza → Bloque G. |

---

## 4. Pruebas Gates OBLIGATORIAS Ejecutadas

> Repetir commands antes de marcar CERRADO cualquier bloque futuro (plantilla CONTINUITY.md §6-7).

### G1 · TypeScript Typecheck ✅ exit 0
```bash
cd /Users/jorgequintero/Documents/GitHub/dj-sync-agent && pnpm typecheck
```
Salida: **Exit Code 0** (engine warnings Node 22 vs 24 ignorables).

### G2 · Tests Single-File Bloque F ✅ 9/9 PASS
```bash
pnpm exec node --import tsx --test src/core/live/live-dj.test.ts
```
Salida:
```
✔ F56.1 ManualNowPlayingSource pushTick valid elapsed + bpm energy (5.55ms)
✔ F56.2 RekordboxActiveCuePollingSource stub devuelve null sin masterDbPath (safe readonly) (0.11ms)
✔ F57.1 LiveDJContext tick incrementa elapsed + played track count (0.37ms)
✔ F57.2 LiveDJContext checkpoint manual se persiste en InMemory (0.11ms)
✔ F57.3 deriveContextTagFromCurrentEnergy clasifica energía + target cierre (0.06ms)
✔ F58.1 recommendLive cool_down excluye high energy y selecciona <= actual-0.02 (1.44ms)
✔ F58.2 recommendLive next_up exclude recent tracks (recentTrackIdsForExclusion) (0.57ms)
✔ F59.1 buildPlannedEnergyCurve 60min progress stages + average (0.66ms)
✔ F59.2 LiveEnergyCurveTracker milestones detecta warmup→peak (1.06ms)
ℹ tests 9 · pass 9 · fail 0 · duration_ms 259
```

### G3 · Tests Full Suite Monotónico ✅ 315/315 PASS (306 baseline E + 9 F)
```bash
pnpm exec node --import tsx --test "src/**/*.test.ts"
```
Salida:
```
ℹ tests 315
ℹ suites 10
ℹ pass 315
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4698.90
```
- Monotonicidad verificada: 306 → 315, **0 regresiones** Bloques B/C/D/E.
- 0 FAIL en Bloques legacy (IPC, UI Electron, Sync, Recommendations, etc.)

### G4 · Constraints User Permanentes VERIFICADOS
| Constraint | Estado | Evidencia |
|---|---:|---|
| G4.1 NO Electron UI changes | ✅ OK | 0 archivos modificados en `src/electron/renderer/**` ni `index.html` |
| G4.2 NO writes Rekordbox master.db | ✅ OK | `RekordboxActiveCuePollingSource.getCurrent()` retorna null siempre · 0 SQL statements · better-sqlite3 NO añadido package.json |
| G4.3 Local First 100% · Supabase NO requerido | ✅ OK | Todo corre en InMemory adapters · 0 imports supabase en Bloque F archivos |
| G4.4 RecommendationEngine intacto · NO reemplazado | ✅ OK | `recommendLive()` usa `createRecommendationEngine()` original + hard constraints additive merge · score base deterministic intact |

---

## 5. Siguiente Bloque Recomendado

### Entrega 07 · 🟠 Bloque G (Fase60 + G2 + G3) — Copilot Agent 2.0 Final + Context Assembler + RekordboxWritePort frontera

Orden según ROADMAP.md §4 después cerrado Bloque F:
1. **Fase 60**: Tools allow-list cerrada: `library.search, library.get_track, recommend.next, recommend.set_slot, set.build, set.analyze, audio.analyze, history.last_session, live_context.get, settings.list` (read-only por ahora).
2. **G2**: Context Assembler integra 4 fuentes: Conversation Memory · DJBehaviorProfile snapshot · last session transitions · live_context actual. Budget ≤80% tokens LLM.
3. **G3**: `RekordboxWritePort` interface SAFE ops: `appendToTempPlaylist(id, tracks[]), createPlaylist(name), deleteTempPlaylist(id)`. Implementación initial mock + Approval 2FA mandatory (Bloque Security Fase29 intacto). Zero writes en master.db real.

Si el usuario menciona "main.ts está muy largo / necesitamos CI" → Entrega01 Bloque A (Roadmap sync + DJCore consolidation + Supabase optional default OFF).

---

## 6. KPIs del Bloque F

| KPI | Valor · Baseline Entrega05 (Bloque E) | Valor · Cierre Entrega06 (Bloque F) | Δ Neto |
|---|---:|---:|---:|
| Tests PASS | 306 | **315** | **+9** |
| Tests FAIL | 0 | **0** | 0 |
| Duration tests suite | ~4700ms | ~4700ms | 0 (Bloque F tests son rápidos ~250ms total) |
| LIVE CONTEXT completitud (ROADMAP §0) | 20% | **100%** | +80pp |
| Nuevos archivos | 0 (bloque cerrado) | **5** | +5 en `src/core/live/` |
| Nuevos Ports Hex (Interfaces) | 9 | **11** | +2: NowPlayingSourcePort · LiveDJCheckpointPort |
