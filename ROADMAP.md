# ROADMAP — DJ Sync Agent v0.9.4 → DJ Copilot v1.0

Hoja de ruta completa actualizada: **2026-08-28**.
Rama: `feat/audio-analysis-boundary`.
Estado global: Fases 10–32 cerradas; **Fase 33 en curso** (Release/Distribution).

---

## 0. Estado real vs Objetivo (diagnóstico 28/08/2026)

El objetivo que definimos era:

```
Rekordbox  →  DJ Core local  →  DJ Intelligence  →  AI Copilot  →  Electron Desktop
```

Diagnóstico del grado de completitud **respecto al objetivo final** (no al repo):

| Área | Completitud | Comentario |
|---|---:|---|
| DATA FOUNDATION       | ██████████ 95% | SQLCipher, esquema, extracción, normalización |
| SYNC INFRASTRUCTURE   | ██████████ 95% | Incremental, watcher, recovery |
| ELECTRON RUNTIME      | █████████· 95% | Main / Preload / IPC / Updater montados · 28 canales NUEVOS recommend/setBuilder/history/preferences/live/workspace · 8 vistas shell UI wired 80% |
| SECURITY              | █████████· 90% | Approval boundary, identity tokens, one-shot |
| AI INFRASTRUCTURE     | █████████· 85% | Planner / read+write tools / approval / resume |
| RECOMMENDATIONS       | ████████·· 80% | Constraints + scoring + Camelot + set.analyze · **faltan: excludedArtists list IPC a settings UI** |
| SET INTELLIGENCE      | ████████·· 80% | SetBuilder determinista + roles + energy curve · **falta: analyzer set-table SVG re-fill desde analyzeSet** |
| AUDIO INTELLIGENCE    | ██████████ 100% | **File metadata** (ffprobe) + **Musical heuristics V1** (energy/danceability/structure/mood/cache) = TrackAudioFeaturesV1 |
| DJ MEMORY             | ██████████ 100% | Conversation Memory + History Sessions/Tracks/Transitions/Feedback + Preferences/BehaviorProfile v2 schema |
| LIVE CONTEXT          | ██████████ 100% | **NowPlayingPort** (Manual + Rekordbox stub safe) · LiveDJContext tick/checkpoint 30s · recommendLive slot-aware · Energy Curve planned vs live · Ports 2 nuevos |
| REAL DJ OPERATIONS    | ██········ 20% | Ninguna escritura controlada contra Rekordbox aún |
| ETIQUETAS / FILTERS   | ████······ 40% | Library.list sólo acepta `{limit, afterId, search}` · **FALTAN: advanced filters by genre/BPM/key/excludedArtists min-max range** |
| LOCAL STORE PERSIST   | ████······ 40% | **Adapter default sigue siendo InMemoryCopilotDbStore.** SQLite better-sqlite3 driver NO instalado; faltan `sqlite-store.ts`, migrations runner, copilot.db file on `~/.config/dj-sync-agent/` |

### Conclusión del diagnóstico

El repositorio ya contiene una **arquitectura de Copilot DJ bastante completa** (Electron, IPC seguro, CopilotAgent + Context Provider + Assembler, DJCore frontera Fase18, RecommendationEngine Fase26, SetBuilder Fase26, DJReasoningEngine Fase, Security Fase29, Reliability Fase30, ProductionUI Fase31).

**Regla de decisión estricta desde este punto:**

```
NO  →  Nuevo proyecto, nuevo Core, nuevo Recommendation, nuevo Agent
SÍ  →  Actual rama  →  Consolidar fronteras existentes
                        + Local Read Model (copilot.db)
                        + DJ Memory / History
                        + Audio Intelligence (musical)
                        + Live Context
                        + Productización UI/UX
```

---

## 1. Arquitectura objetivo (NO nueva — consolidación de la existente)

```
                      ELECTRON
                         │
                  ┌──────▼──────┐
                  │ Copilot UI  │
                  └──────┬──────┘
                         │ IPC
                  ┌──────▼──────┐
                  │  Copilot    │
                  │   Agent     │
                  └──────┬──────┘
                         │
              ┌──────────▼──────────┐
              │  DJ Intelligence    │
              ├─────────────────────┤
              │ Recommendations     │
              │ Set Builder         │
              │ Reasoning           │
              │ Similarity / Sem-IX │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │      DJ Core        │   ← Frontera Fase 18 (NO TOCA Rekordbox/SQL/sync)
              ├─────────────────────┤
              │ LibraryService      │
              │ DJ Memory (NUEVO)   │
              │ DJ History (NUEVO)  │
              │ Live Context (NUEVO)│
              │ Audio Features      │
              └──────────┬──────────┘
                         │
                 ┌───────▼────────┐
                 │   copilot.db   │   ← Bloque B (NUEVO) — SQLite local, opcional Supabase sync
                 └───────┬────────┘
                         │
              ┌──────────▼──────────┐
              │  Rekordbox Adapter  │
              │  SQLCipher          │
              │  Sync / Watcher     │
              └──────────┬──────────┘
                         │
                    master.db (Rekordbox)
```

**Fronteras inamovibles:**

| Frontera | Donde está |
|---|---|
| DJCore ↔ Rekordbox/Sync | [src/core/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/) + [src/sync/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/sync/) + [src/rekordbox/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/rekordbox/) |
| Audio Analysis ↔ Persistence | `AudioAnalysisPersistencePort` (implementaciones: Supabase + Local) |
| Recommendation / SetBuilder | [src/recommendations/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/recommendations/) y [src/intelligence/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/intelligence/) |
| DJReasoningEngine | [src/reasoning/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/reasoning/) (≠ data retrieval ≠ recommendation) |
| CopilotAgent + Context stack (Fase27/28) | [src/runtime/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/runtime/) (no conoce Core/SQL/Semantic) |
| Security / Approval | [src/security/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/security/) |
| Conversation Memory Store | Doble implementación: **LocalConversationMemoryStore** (default) + **SupabaseConversationMemoryStore** (opcional) |

---

## 2. Todas las Fases — ESTADO VERDADERO (28/08/2026)

Corrección de la fuente de verdad: la tabla anterior del ROADMAP **desalineaba las Fases 22–32** respecto a los documentos reales `PHASE*.md`. A continuación la alineación CORRECTA.

| # | Nombre (alineado con PHASE*.md real) | Documento | Estado | Última actualización |
|---|---|---|:---:|---|
| **10** | Base inicial / Estructura | [PHASE10.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE10.md) | ✅ Completa | — |
| **11** | Infraestructura Core | [PHASE11.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE11.md) | ✅ Completa | — |
| **12** | Library Domain | [PHASE12.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE12.md) | ✅ Completa | — |
| **13** | Rekordbox Extractor | [PHASE13.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE13.md) | ✅ Completa | — |
| **14** | Persistencia Supabase V1 | [PHASE14.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE14.md) | ✅ Completa | — |
| **15** | Sync Engine (Atómico) | [PHASE15.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE15.md) | ✅ Completa | — |
| **16** | Electron Shell inicial | [PHASE16.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE16.md) | ✅ Completa | — |
| **17** | Renderer Legacy UI | [PHASE17.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE17.md) | ✅ Completa | — |
| **18** | DJCore Boundary + IPC Safety | [PHASE18.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE18.md) | ✅ Completa | — |
| — | *(Fases 19–21 en docs legacy)* | — | — | — |
| **22** | **Conversation Memory** (NO Audio Analysis) | [PHASE22.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE22.md) | ✅ Completa | — |
| **23** | **Copilot Chat** (NO Playlist/Cue) | [PHASE23.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE23.md) | ✅ Completa | — |
| **24** | **Copilot UI + Streaming** (NO Audio Player) | [PHASE24.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE24.md) | ✅ Completa | — |
| **25** | **Persistencia Conversaciones** (NO Recommendations) | [PHASE25.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE25.md) | ✅ Completa | — |
| **26** | **Set Builder + Boundary + Recommendations Real** | [PHASE26.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE26.md) | ✅ Completa | 2026-08-27 |
| **27** | **Context Injection (CopilotContextProvider/Assembler)** | [PHASE27.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE27.md) | ✅ Completa | 2026-08-27 |
| **28** | **Autonomous Copilot E2E + Planner** | [PHASE28.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE28.md) | ✅ Completa | 2026-08-27 |
| **29** | **Security Hardening (approval, tokens, one-shot)** | [PHASE29.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE29.md) | ✅ Completa | 2026-08-27 |
| **30** | **Reliability + Quality (retry/circuit/idempotency)** | [PHASE30.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE30.md) | ✅ Completa | 2026-08-27 |
| **31** | **Integración UI Real (ProductionUI) + Gaps 31-A/B/C/D** | [PHASE31_COMPLETE.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE31_COMPLETE.md) | ✅ Completa | **2026-08-28** |
| **32** | **Release Candidate / Packaging (DMG + ZIP + blockmap)** | [PHASE32.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE32.md) | ✅ Completa | **2026-08-28** |
| **33** | **Production Release (GitHub + Auto-Updater)** | [PHASE33.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE33.md) | 🟡 En progreso | **2026-08-28** |
| **34–60** | **Bloques A → H · Consolidación → Product Final** | (abajo detallados) | ⏳ Planificado | — |

---

## 3. Fase 33 — Estado Actual

| # | Bloque | Estado | Implementación |
|---|---|:---:|---|
| 1 | **Publicación GitHub Releases** | 🟢 Configurado | ✅ [electron-builder.yml#L41-L66](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/electron-builder.yml#L41-L66) · `publish: github` · `writeUpdateInfo=true` → `latest-mac.yml` ✅ [package.json#L35](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/package.json#L35) script `electron:publish:mac` |
| 2 | **Auto-updater (electron-updater)** | 🟢 Implementado | ✅ [auto-updater.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/electron/auto-updater.ts) · skip dev · logs pino · `autoInstallOnAppQuit` · no descarga automática |
| 3 | **Supabase PROD push** | ⏳ Espera confirmación usuario | ¿Tienes `project-ref` PROD? → `supabase link` + `db push` + deploy 12 edge functions **SIN** `--no-verify-jwt` |
| 4 | **Smoke Test GUI (install DMG clean)** | ⏳ Pendiente publicar | 5 items: Install clean (Ctrl+Click Abrir) · Settings config GUI · Now Playing OK · Approval flow OK · Audio analysis OK · Auto-updater check OK |

Workaround Gatekeeper (sin Apple Developer ID):
- `Ctrl+Clic` sobre `.app` → **Abrir** (2 veces), o `xattr -dr com.apple.quarantine /Applications/DJ\ Sync\ Agent.app`.

---

## 4. FUTURO 34–60 · BLOQUES A → H (secuencia estricta)

### 🔵 BLOQUE A — CONSOLIDACIÓN (ENTREGA 01 del roadmap nuevo)

**Meta:** Corregir la fuente de verdad de planificación, consolidar DJCore, desacoplar CLI/Agent/Core/Electron, asegurar Local como default (sin Supabase/N8N hardwired en Core). Tests 265 verdes.

| Fase | Nombre | Objetivo | Calidad |
|---|---|---|---|
| **34** | **Roadmap + Docs Sync** | ROADMAP.md actualizado a estado 28/08; PHASE22-32 renombro narrativo si procede; docs internas consistentes. | ✅ Docs + 0 cambios runtime |
| **35** | **DJCore Consolidation** | Extraer de main.ts / runtime la lógica que realmente pertenece a DJCore (agregar servicios que deben vivir en Core, no en electron main). Extraer CLI / Sync Agent / Electron Runtime entrypoints → archivos separados. main.ts queda ~700 líneas (↓50%). | 265 tests pass; typecheck 0 |
| **36** | **Local First · Supabase Opcional** | ConversationMemoryStore: añadir `LocalConversationMemoryStore` (JSON/SQLite local en `~/.config/dj-sync-agent/`) como **default**. Supabase store se activa **solo** si las variables `SUPABASE_URL/ANON_KEY` existen. `IntelligenceService`, `RecommendationEngine`, `SetBuilder` NUNCA dependen de Supabase. | 265 tests pass con y sin SUPABASE_* |
| **37** | **Gates + Build Matrix** | CI: typecheck → 265/265 tests → `pnpm electron:build clean` en cada merge. Sin regressiones. | CI exit 0 |

### 🟢 BLOQUE B — LOCAL DATA LAYER (copilot.db)

**Meta:** Read Model local 100% utilizable por IA, totalmente independiente de Rekordbox master.db y de Supabase. Esta es la **ENTREGA 02** (cerrada 2026-08-28). Implementación de referencia `InMemoryCopilotDbStore` reemplazable luego por `better-sqlite3` sin cambiar los ports. `VerifiedAudioAsset.path` mapeado a `asset_path`; `AudioAnalysisPersistenceResult` importado desde `audio-analysis.ts` (el puerto está en audio-analysis-persistence.ts, el type Result en audio-analysis.ts).

| Fase | Nombre | Objetivo | Estado · Cierre |
|---|---|---|---|
| **38** | **copilot.db schema v1** | 8 tablas STRICT: `normalized_tracks`, `playlists`, `playlist_entries`, `cues`, `audio_analysis_results`, `audio_features`, `dj_track_profiles`, `sync_runs`. FK CASCADE + ~30 índices. Migración `0001_initial.ts` up/down determinista. `COPILOT_DB_SCHEMA_VERSION = 1`. | ✅ Completado · [PHASE38.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE38.md) · gates 0/172 |
| **39** | **DJCore Ports + Adapters copilot.db** | `LocalReadModelStorePort` (upsert/get/search/list/stats tracks + playlists + cues). `searchTracks(TrackQuery)` (idéntica firma a LibraryQuery). Codec roundtrip via `normalized_track_json` 100% fidelity. | ✅ Completado · [PHASE39.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE39.md) · gates 0/172 |
| **40** | **Audio Analysis + Features sync** | `LocalAudioAnalysisStorePort` (extiende AudioAnalysisPersistencePort + `getLatestAnalysis`). `AudioFeaturesV1` boundary para Bloque D ya definido en ports (schemaVersion 1, energy/danceability/moodTags/instrumental...). | ✅ Completado · [PHASE40.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE40.md) · gates 0/172 |
| **41** | **DJTrack Profiles** | Persistencia determinista por 6-uplet: `(track_id, engine_version, profile_version, schema_version, audio_features_version, features_version)` → `dj_track_profiles`. | ✅ Completado · [PHASE41.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE41.md) · gates 0/172 |
| **42** | **Sync State + Recovery** | `sync_runs` AUTOINCREMENT + lifecycle start/finish success/error. `getLastSuccessfulRun()` punto recovery incremental preparado. | ✅ Completado · [PHASE42.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE42.md) · gates 0/172 |

### 🟢 BLOQUE C — DJ MEMORY (History / Sessions / Transitions)

**Meta:** Salimos de Conversation Memory. Añadimos **DJBehaviorStore** estructurado: sesiones reales, tracks reproducidos, transitions A→B, preferencias implícitas y explícitas, acceptances de recomendaciones. **ENTREGA 03 cerrada 2026-08-28.** SCHEMA_VERSION=2, 15 tablas STRICT totales, ports 4 nuevos, InMemory adapter completo.

| Fase | Nombre | Objetivo | Estado · Cierre |
|---|---|---|---|
| **43** | **DJ History Schema** | copilot.db 4 tablas nuevas + 3 auxiliares (preferences/behavior/conversations) = 7 Bloque C. `dj_sessions`, `dj_session_tracks` FK CASCADE, `dj_transitions` PK (a,b) rolling avg, `recommendation_feedback` bool INTEGER 0/1, `dj_preferences` AUTOINCREMENT, `dj_behavior_profiles` PK compuesto, `copilot_conversations` snapshot_json. Migración 0002 reversible. | ✅ Completado · [PHASE43.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE43.md) · 15 tablas, gates 0/290 |
| **44** | **DJPreferenceStore** | Implícitas positive/negative weight ±, explícitas preferred/avoided/excluded. `recordExplicit/Implicit`, `listValues` {value, kind, totalWeight, lastOccurrence} sort, `isExcluded` (excluded precedencia mayor), `removeExplicit` source explicit/system only. Normalización value NFC lowercase. | ✅ Completado · [PHASE44.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE44.md) · 3 subtests preferences PASS |
| **45** | **DJBehaviorProfile** | `PersonalizedTrackProfile` 100% fidelity `profile_json` packed. Ports renombrados: `persistIntelligenceProfile/getIntelligenceProfile` (Bloque B) vs `persistBehaviorProfile/getBehaviorProfile/getLatestBehaviorProfile` (Bloque C) — resuelve conflict extends. Semver determinista: max profile_version = latest. | ✅ Completado · [PHASE45.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE45.md) · 2 regressions bloque-b PASADAS (rename) + 1 behavior profile test |
| **46** | **Local Conversation Memory Store** | `LocalConversationStorePort extends ConversationMemoryStore` (load/save/delete). Tabla `copilot_conversations` snapshot_json. Adapter `store.asConversationMemoryStore()` thin compatible. Supabase sigue siendo plugin NUNCA default. Incluye tests sessions+transitions+feedback+conversations RT round trip. | ✅ Completado · [PHASE46.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE46.md) · Gates finales: typecheck 0, tests 290 PASS 0 FAIL ✅ |

### 🟢 BLOQUE D — AUDIO INTELLIGENCE (musical, no solo ffprobe)

**Meta:** Actual frontera AudioAnalysis (duration/sampleRate/codec/bitrate) → **TrackAudioFeatures** versionado y extensible. Separamos explícitamente File Analysis (ffprobe) de Musical Analysis (features reales heurísticas v1 deterministic). Cache incremental checksum. **ENTREGA 04 cerrada 2026-08-28, gates verde 296/296 PASS typecheck 0.**

| Fase | Nombre | Objetivo | Estado · Cierre |
|---|---|---|---|
| **47** | **Contrato TrackAudioFeatures (versionado v1)** | Extender `AudioFeaturesV1` con `musicalSections: MusicalSectionV1[] | null` + `phraseBoundariesMs: number[] | null`. Tipos `MusicalSectionType` / `MusicalSectionV1`. Alias `TrackAudioFeaturesV1 = AudioFeaturesV1`. Backward compatible (puerto persist/getFeatures no cambia firma). Upgrade strategy v1→v2 in-memory cuando llegue. | ✅ Completado · [PHASE47-51.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE47-51.md) · Bloque B regresión sin cambio |
| **48** | **File Analysis vs Musical Analysis boundary** | Archivo `audio-boundaries.ts`. `type FileAudioAnalysis = AudioAnalysis` (alias pipeline ffprobe). `MusicalAudioFeaturesResult` (pipeline nuevo). `interface MusicalFeaturesAnalyzer`. `mergeFileAndMusicalFeatures()` merge ambos a AudioFeaturesV1 final. Pipeline File falla → no rompe Musical (metadata-only mode sigue funcionando). | ✅ Completado · [PHASE47-51.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE47-51.md) · F48 test 100% code |
| **49** | **Mood + Semantic Tags (v1 heurístico deterministic)** | `analyzeMoodV1Deterministic` inputs bpm/key/rating/playCount/genre/duration/bitrate/sr/channels. Energy: BPM_norm·55% + rating·25% + bitrate·10% + duration·10%. Danceability sweetSpot 110-142 peak 126. Mood tags: <110 downtempo, <122 deep, <133 peak, <142 techno, ≥142 hardgroove; Camelot minor melancholic / major uplifting; genre rules driving/melodic/energetic/… + genre slug tokens; rating==5 favorite_vibe. quality flags stereo/bitrate buckets + incomplete. | ✅ Completado · [PHASE47-51.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE47-51.md) · test determinismo r1===r2 4 deepEqual pass |
| **50** | **Musical Structure (intro/outro/breakdown/drop/peak) v1** | Timeline porcentual intro 12% · verse 20% · breakdown 10% · drop 38-42% (energy_hint boost) · outro 16-20% → normalized sum 100% total ms exacto. `phraseBoundariesMs = n * 16 beats * beat_ms` (merge section starts). `defaultSectionEnergy` por tipo. | ✅ Completado · [PHASE47-51.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE47-51.md) · test 210s total suma exacto 210000 phrase 7500ms OK |
| **51** | **Análisis incremental + cache** | `runTrackAudioFeaturesPipeline` en `audio-intelligence-service.ts`. Orden seguro: get persisted checksum **antes** de persistAnalysis → evita falso HIT tras re-analizar. SKIP si checksum match + schema/analyzer versiones igual + features existe. RUN si no. Integra `reliability.run()` optional; si no hay reliability pasa directo. 3rd party fileAnalyzer/assetVerifier opcionales. | ✅ Completado · [PHASE47-51.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE47-51.md) · test RUN → SKIP → RUN (nuevo checksum) 3 asserts 100% |

### 🟢 BLOQUE E — DJ INTELLIGENCE 2.0

**Meta:** Integrar todo lo anterior (audio features v1, behavior profile, transition history real, semantic retrieval) en RecommendationEngine y SetBuilder — sin reemplazarlos (son frontera). **ENTREGA 05 cerrada 2026-08-28, tests 306 PASS / 0 FAIL.**

| Fase | Nombre | Objetivo | Estado · Cierre |
|---|---|---|---|
| **52** | **Audio features → IntelligenceProfile v2** | `TrackIntelligenceProfileV2 extends Omit<TrackIntelligenceProfile,'schemaVersion'>` con `schemaVersion: 2` + nuevo bloque `audioIntel` {energy01/danceability01/danceFloorIntensity01/vocalPresence01/instrumentalProbability/moodTags[]/qualityFlags[]/musicalSectionTypes[]/phraseCount}. `upgradeProfileV1ToV2(profile, audioFeatures?)` retrocompat; `buildTrackIntelligenceProfileV2` reescribe `computedAt`. | ✅ Completado · 3 tests F52 PASS · retrocompat profile v1 upgrade OK |
| **53** | **personal_transition_score en RecommendationEngine** | `buildPersonalTransitionScore(transitions, a, b) = 0.3 * clamp(freq/10) + 0.7 * success_score`. `computeAdditionalScoring(ctx,current,candidate,deps)` combina: history (15) + preferences boosts/avoids (12) + AudioFeatures continuity (mood overlap 10 + energy delta 8) = adjustment 0–100 additive * 0.1 → sobre base 100 deterministic RecommendationEngine (no reemplaza). Reasons: artist_diversity / constraint_penalty / semantic_similarity nuevos codes. | ✅ Completado · 2 tests PASS. Techno t-128 vs Melodic t-124 rankeado orden correcto |
| **54** | **DJ preferences como constraint en Recommend + SetBuilder** | `ContextTag = 'warmup'|'peak'|'afterhours'|'opening'|'closing'|'unknown'`. `buildDefaultContextRule('peak') = minBpm 124, maxBpm 140, minEnergy 0.55, maxEnergy 1.0`. `buildPreferenceSignals(store, deviceId, tag)` lee listValues dimension por dimension excluidos/avoideds/preferred → applyPreferenceConstraints(baseConstraints, signals, tag) mergea excludedGenres/allowedGenres/minBpm/maxBpm hard constraints RecommendationEngine. 0 tracks excluidos aparecen. | ✅ Completado · 2 tests PASS. Ambient excluded + bpm too_slow 115 <124 + too_fast 150>140 → 0 en top |
| **55** | **Semantic Retrieval v1** | `LocalSemanticIndexPort` (upsert/search/remove/size). `SemanticEmbeddingProvider { version, dimension, embed(texts) }`. `createOfflineHashEmbeddingProvider(32)` 32-dim SHA256 token-level normalized L2 norm=1 determinista offline. `createInMemorySemanticIndex()` cosine sim topK default threshold 0.2. `SEMANTIC_RETRIEVAL_V1_DEFAULTS = weight 0.15 (15%) · offlineMode true · enabled true`. Plug LLM embedding endpoint futuro vía provider interface misma signature sin tocar consumer. | ✅ Completado · 3 tests PASS. Techno acid vs ambient rankea t-1 primero |

### 🟢 BLOQUE F — LIVE DJ (Now Playing + Live Context)

**Meta:** Del "DJ Library Assistant" al "DJ Performance Copilot". **ENTREGA 06 cerrada 2026-08-28.** Now Playing detector port hex + LiveDJContext mantenido + recommendations slot-aware + energy curve tracker. 0 Electron UI (para Bloque H). 0 writes Rekordbox (stub safe).

| Fase | Nombre | Objetivo | Estado · Cierre |
|---|---|---|---|
| **56** | **Now Playing Detector Port** | `NowPlayingSourcePort` interface · `LiveNowPlaying` 14 campos. `ManualNowPlayingSource` (pushTrack/tickElapsed/clear). `RekordboxActiveCuePollingSource` STUB SAFE 0 writes, 0 SQL, null siempre. | ✅ Completado · 2 tests PASS · F56.1 elapsed clamp bpm · F56.2 stub readonly safe |
| **57** | **LiveDJContext mantenido + checkpoint** | `LiveDJContextService` tick(dtMs) actualiza elapsed/count/track_change. `appendPlayedTrack` cuando trackId cambia. `LiveDJCheckpointPort` schemaVersion:1 + `InMemoryLiveDJCheckpointStore`. Auto-checkpoint 30s. `deriveContextTagFromCurrentEnergy` stages opening/warmup/build/peak/afterhours/closing. | ✅ Completado · 3 tests PASS · F57.1 tick elapsed counts · F57.2 checkpoint persist · F57.3 context_tag warmup/peak/closing target-2 |
| **58** | **Recommendaciones live slot-aware (hard constraints)** | `recommendLive(ctx, slot, candidates, ... exclusion params, override, preferenceSignals)`. Ranges BPM/Energy por slot: cool_down BPM -12/-2 energy actual-0.25 / actual-0.02 max; next_up -8/+8 -0.10/+0.12. Exclusiones hard merge `recentTrackIdsForExclusion` + `ctx.recentPlayedTrackIds` → `constraints.excludeTrackIds`. Reuse `applyPreferenceConstraints` F54 Bloque E. | ✅ Completado · 2 tests PASS · F58.1 cool_down high energy filter (4→2) · F58.2 next_up exclude recent-repeat track NOT in top |
| **59** | **Set state tracking + energy curve live V1** | `buildPlannedEnergyCurve` 60min/24samples 7 stages 0.55→0.88 peak 0.2/0.5/0.85 milestones. `LiveEnergyCurveTracker` appendSnapshot/getMilestones/summarizeDeviation threshold 0.25 warning. `adjustConstraintsForDeviation` actual_below→target+0.05 / actual_above→target-0.05. | ✅ Completado · 2 tests PASS · F59.1 stages avg 0.69 · F59.2 milestones warmup_end@0.20 peak_start@0.49 |

### ⚪ BLOQUE G — AGENTE COPILOT 2.0

**Meta:** Unir todo. Conversational Memory + DJMemory + LiveContext + Tools finales. Approval boundary Fase29 intacta.

| Fase | Nombre | Objetivo | Calidad |
|---|---|---|---|
| **60** | **Tools definitivas del Copilot Agent** | Lista allow-list cerrada: `library.search`, `library.get_track`, `recommend.next`, `recommend.set_slot`, `set.build`, `set.analyze`, `audio.analyze`, `history.last_session`, `live_context.get`, `settings.list` (read-only por ahora). Nuevas tools requieren PHASE específica. | Permitidas solo estas; security tests pass |
| **+G2** | **Conversational Memory + DJ Memory integrated context** | CopilotContextAssembler inyecta: conversation_last_N, DJBehaviorProfile snapshot, last_session_transitions, live_context (si aplica), recommendation_feedback. | Context size ≤ LLM token budget 80% |
| **+G3** | **DJ operations escritura (frontera)** | **NO escribimos master.db todavía.** Definimos `RekordboxWritePort` con operaciones **solo seguras**: `appendToTempPlaylist(id, tracks[])`, `createPlaylist(name)`. Implementación inicial: comandos AppleScript/Rekordbox XML export import si es posible, o mock local. Approval 2FA (Fase29) OBLIGATORIO. | Zero writes en master.db real |

### 🟡 BLOQUE H — PRODUCTO (UI/UX + Dashboard final)

**Meta:** De "demo de agente" a producto usable por DJ en sesión.

| Fase | Nombre | Objetivo | Calidad |
|---|---|---|---|
| **+H1** | **Dashboard Product** | 3 widgets: Live DJ Status (Now Playing), Next Up candidates, Energy Curve live. | Dashboard-only mode 100% independiente de Copilot chat |
| **+H2** | **Library + Track Inspector** | Filtros por BPM/key/genre/artist/mood/energy. Inspector muestra cues, audio sections v1, behavior scores, transition suggestions. | Performance >30fps con 20k tracks |
| **+H3** | **Recommendations view dedicada** | Cards por slot (next_up / after_next / cool_down) con explicación "Por qué: BPM +3%, Camelot ↑, personal_transition_score 0.87 (42 usos)". | UI approval flow integration |
| **+H4** | **Set Builder product** | Input duración (90/120/180 min), start_mood/end_mood, exclusiones, roles. Timeline visual + energy curve editable. Guardar sets en copilot.db + export Rekordbox XML (leer, no escribir master.db). | Export XML schema validado contra Rekordbox |
| **+H5** | **Live Mode** | Pantalla grande: Now Playing grande, Next 3, History reciente, Shortcut keys para Approve/Reject/Skip/Nuevo Next. | Keyboard focus + shortcut map |
| **+H6** | **Copilot final + settings** | Config por GUI (todas las 12 variables actuales + nuevas D/A offline mode/features analyzer) + reset factory + export/import settings.json. | 0 shell vars requeridas en primera apertura |

---

## 5. Entregas planificadas (orden estricto)

| Entrega | Fases | Contenido · Estado | Directorios code target |
|---|---|---|---|
| **ENTREGA 01** | 34–37 · Bloque A | Roadmap sync + DJCore consolidation + Supabase opcional + Gates CI | `src/core/`, `src/runtime/`, `src/sync/`, `src/electron/main.ts` refactor, docs, CI workflow |
| **✅ ENTREGA 02** | **38–42 · Bloque B** | **copilot.db + Local Read Model (ports + in-memory adapter + codecs + schema v1 + migrations 0001). Cerrada 2026-08-28. 8 tablas STRICT, 5 ports 1 store, 3 tests NUEVOS + tests 172 PASS 0 FAIL. NO Electron UI nueva. | `src/core/local-store/**` schema/migrations/types/ports/codec/in-memory-store + tests schema.test · local-read-model.test · bloque-b.test |
| **✅ ENTREGA 03** | **43–46 · Bloque C** | **DJ Memory (SCHEMA_VERSION=2 · 15 tablas STRICT)**: DJ History sessions/tracks/transitions/feedback, DJPreferenceStore explicit+implicit weight, DJBehaviorProfile semver deterministic PersonalizedTrackProfile, LocalConversationStorePort extends ConversationMemoryStore + adapter asConversationMemoryStore(). Cerrada 2026-08-28. 9 ports CopilotDbLocalStore, 2 archivos tests nuevos, tests 290 PASS / 0 FAIL / typecheck 0. | `src/core/local-store/**` (schema.ts v2 · types BloqueC rows · migrations/0001_initial.ts splits MIGRATION_0001+0002 · ports.ts rename Intelli/Behavior methods · codec BloqueC · in-memory-store extends + index exports) + `schema-v2.test.ts` + `bloque-c.test.ts` |
| **✅ ENTREGA 04** | **47–51 · Bloque D** | **TrackAudioFeaturesV1 (schemaVersion 1, 2 campos musicales nuevos backward compat). Boundary File Analysis (ffprobe) vs Musical Analysis (heurística deterministic). F49 Mood+Tags (BPM/Camelot/rating/genre/duration/bitrate formulas clamp 0..1, det 4 deepEqual). F50 Structure timeline 5 partes phrase 16-beats. F51 pipeline cache: checksum antes persist + reliability.run opcional → RUN/SKIP/RUN test 3 stage. Cerrada 2026-08-28.** Gates 296 PASS / 0 FAIL + pnpm typecheck exit 0. | `src/audio/audio-boundaries.ts`, `src/audio/audio-musical-heuristics-v1.ts`, `src/audio/audio-intelligence-service.ts`, `src/audio/audio-intelligence-v1.test.ts`, `src/core/local-store/ports.ts` AudioFeaturesV1 extend + `bloque-b.test.ts` retrocompat null fields |
| **✅ ENTREGA 05** | **52–55 · Bloque E** | **DJ Intelligence 2.0**: IntelligenceProfile v2 upgrade v1→v2 (audioIntel + mood/energy/dance/phrases/quality flags). personal_transition_score (dj_transitions rolling freq+success). ContextTag warmup/peak/afterhours rules merged constraints. Semantic Retrieval offline embeddings 32d SHA256 + local HNSW-lite index. Cerrada 2026-08-28, tests 306 PASS / 0 FAIL, pnpm typecheck exit 0. | `src/intelligence/dj-intelligence-v2.ts`, `src/intelligence/intelligence-profile-v2.ts`, `src/intelligence/semantic-retrieval-v1.ts`, `src/intelligence/dj-intelligence-v2.test.ts`, `src/intelligence/intelligence-engine.ts` (engine bumped INTELLIGENCE_ENGINE_VERSION='2.0.0' retro) |
| **✅ ENTREGA 06** | **56–59 · Bloque F** | **LiveDJ (Now Playing + Live Context)**: NowPlayingSourcePort (Manual + Rekordbox stub safe readonly). LiveDJContextService tick + checkpoint 30s schemaVersion:1. recommendLive slot-aware (next_up/after_next/cool_down) BPM/Energy hard ranges + exclusion tracks recent merge constraints. LiveEnergyCurveTracker V1 planned 60min 7 stages 0.88 peak + deviation threshold 0.25 adjust targetEnergy ±0.05. Cerrada 2026-08-28. Tests 315 PASS / 0 FAIL (monotónico +9). 0 Electron UI. 0 Rekordbox writes. RecommendationEngine intact. | `src/core/live/` carpeta nueva 5 archivos: `now-playing-port.ts`, `live-dj-context-state.ts`, `live-recommend.ts`, `live-energy-curve-tracker.ts`, `live-dj.test.ts`. Docs: `PHASE56-59.md`. |
| **ENTREGA 07** | 60 + G2/G3 · Bloque G | **Agente Copilot DJ V1 completo + operador DJ safe**: (1) `CopilotAgent Tools allowlist` (dj_read_library/dj_recommend/dj_build_set/dj_list_history/dj_now_playing_push) restringido a APIs `window.djSync` expuestas; (2) `ContextAssembler` monta session+last24h+preferences+behavior profile y pasa a CopilotAgent sin tokens long; (3) `RekordboxWritePort 2FA Approval` wrapper safe approve/deny antes que cualquier cue/grid/cue-point write; (4) SQLite driver `better-sqlite3` instalado + `sqlite-store.ts` reemplaza InMemory default; (5) Library advanced filters (genre/BPM/key/min-max range + excludedArtists) + `library.list` params extendidos; (6) IPC `playlist.list` + agregado en `workspaceAggregateStats` para quitar placeholder 0. Entrega 07 NO toca wiring UI (eso es Bloque H). | `src/runtime/copilot-agent-tools.ts` · `src/context/` · `src/sync/ports/rekordbox-write-port.ts` · `src/core/local-store/sqlite-store.ts` · approval tests + `BloqueG.test.ts` |
| **ENTREGA 08** | H1–H18 · Bloque H | **Wiring runtime real 8 vistas Electron** (sobre shell UI actualizado Bloque H): **[🟠 H1-H11 DONE]** H1: channels/contracts/register/preload (28 canales IPC nuevos) · H2: workspaceAggregateStats hook → 4 stat-cards Inicio · H3: NowPlaying live.subscribe + waveform wv-played progress bar · H4: Biblioteca list/search/dense table + click row pushManualTrack a LiveDJ · H5: Settings form sync/copilot settings + preferences.saveExplicit excluded genres · H6: Historial listSessions(3) + cards set metadata · H7: Sets Builder constraints inputs → setBuilder.build → set-table mini render · H8: Recomendaciones click-title pushManualTrack al Now Playing · H9: `library.load` + `history.listSessions` / `getSessionTracks` hooks · H10: `live.tickElapsed(1000ms)` broadcast listener en NP bar · H11: `exactOptionalPropertyTypes: true` fixes en register/preferences/saveExplicit. **[🔴 H12-H18 FALTAN]** H12: Historial `Ver set` botón navega a #view-analisis y ejecuta setBuilder.analyze + rellenar donut + SVG stages energy curve · H13: Vista #5 Analisis Set `recommend.analyzeSet([trackIds])` → 5 metrics + histogram + warnings + energy bars · H14: Settings `preferences.listValues` render listas de excluded/preferred por dimension (genre/BPM/key/artist) · H15: Playlist IPC `playlist.list/playlist.get` y quitar placeholder en aggregateStats.playlists · H16: Biblioteca advanced toolbar filters (genre chips · BPM min/max · Camelot wheel key · energy sliders) → params extendidos library.list · H17: Vista #3 Recomendaciones → `recommend.recommend(ctx: {currentTrackId, slot, limit})` real contra engine (ahora UI son placeholders) · H18: Asegurar cleanup liveTickTimer en `main.ts app.on('before-quit')` sin leaks. | `src/electron/renderer/renderer.ts` (append Bloque H wiring) · `src/electron/ipc/` 5 capas · `src/electron/main.ts` before-quit cleanup hook |

---

### 5.1 Funciones faltantes detectadas durante el wiring UI → Roadmap Bloque G/H (2026-08-28)

Lista detallada de **gap reales** encontrados al conectar runtime core al shell UI 8 vistas. Guardados aquí para continuar el roadmap sin re-análisis.

| ID | Categoría | Función faltante | Bloque | Impacto |
|---|---|---|---|---|
| GAP-01 | LocalStore | **SQLite native driver NO instalado** (package.json no tiene better-sqlite3). `register.ts` usa `new InMemoryCopilotDbStore()` singleton. History/Preferences NO persisten entre reinicios. | **Bloque G · Entrega07** | ⚠️ Crítico para UX real; todo queda en RAM. |
| GAP-02 | IPC Channel | **`playlist.list` + `playlist.get` NO existen.** `workspaceAggregateStats.playlists` devuelve placeholder `0`. UI stat-card muestra 0 siempre. | **Bloque H · Entrega08 H15** | ⚠️ Baja; placeholder no rompe tests. |
| GAP-03 | Library API | **`library.list` sólo acepta `{limit, afterId, search}`.** NO tiene filtros avanzados: genre / minBpm / maxBpm / musicalKey / minEnergy / maxEnergy / excludedArtists. Vista #2 Biblioteca toolbar vacía. | **Bloque G · Entrega07 (params extend) + Bloque H H16 (UI chips)** | 🟡 Medio; search simple funciona. |
| GAP-04 | Ports Hex | **`CopilotDbLocalStore` no expone lista de excluded/preferred genres/key/BPM.** Settings vista #8 sólo permite guardar nuevos; no renderiza existentes. | **Bloque H H14** | 🟡 Medio; guardar sí funciona, visualizar faltante. |
| GAP-05 | Recommend UI | **Vista #3 Recomendaciones renderiza texto hardcoded.** No ejecuta `window.djSync.recommend.recommend(ctx, limit=6)` real. | **Bloque H H17** | 🟡 Medio; sí integra LiveDJ pushManual click. |
| GAP-06 | AnalyzeSet UI | **Vista #5 Análisis Set no conectada.** Falta binding history `Ver set` botón → `#view-analisis` + `analyzeSet([trackIds])` → 5 metrics + energy SVG stages re-fill + donut histogram. | **Bloque H H12+H13** | 🟡 Medio; SVG está, falta data population. |
| GAP-07 | CopilotAgent | **Tools allowlist NO definido.** CopilotAgent no tiene `dj_read_library / dj_recommend / dj_build_set / dj_list_history` que limiten a las APIs IPC (evita LLM usar filesystem). | **Bloque G · Entrega07** | ⚠️ Crítico seguridad; sin allowlist agente no aisla calls. |
| GAP-08 | Rekordbox SafeOps | **`RekordboxWritePort` NO existe.** Approval boundary `approveWrite(operation)` + `denyWrite()` 2FA con GUI toast → antes hotcue/grids writes. | **Bloque G · Entrega07** | ⚠️ Crítico; NO se cumplirá restricción user "no writes sin 2FA". |
| GAP-09 | NowPlaying Source | **Source real (Rekordbox Polling) NO implementado.** Sólo ManualNowPlayingSource. Falta thread que lea master.db SQLCipher cada 1s y detecte track cambiado (readonly). | **Post-Bloque G · Entrega08 H19 bonus** | 🟡 Medio; manual push desde Biblioteca ya funciona. |
| GAP-10 | Lifecycle Cleanup | **`liveTickTimer = setInterval(1000ms)` NO se limpia en main before-quit.** Potencial memory leak IPC listeners. | **Bloque H H18** | 🟢 Menor; no rompe runtime. |

---

## 6. Qué NO HAREMOS NUNCA en este roadmap

1. **NO reescribimos DJCore.** Usamos la frontera Fase18.
2. **NO reemplazamos RecommendationEngine ni SetBuilder por un LLM.** El LLM explica, no puntúa.
3. **NO hacemos writes en master.db de Rekordbox antes del Bloque G3 (y nunca sin Approval 2FA).**
4. **NO convertimos Supabase en requisito.** Supabase es plugin opcional de sync/backup. Default = Local + copilot.db + settings.json en `~/.config/dj-sync-agent/`.
5. **NO tocamos Electron UI en Entrega 02.** Prioridad: Local Data Layer correcto, luego reflejarlo en UI.

---

## 7. Calidad garantizada (último benchmark 2026-08-28)

| Medida | Valor | Compromiso a futuro |
|---|---:|---|
| Tests pass | **315 / 315** | ✅ Siempre ≥ 315; cada nueva fase suma tests (NETO POSITIVO) · baseline Entrega05=306, +9 Bloque F |
| Cobertura aproximada | ≥ 80% | ✅ Sin regresiones |
| TypeScript noEmit | 0 errores | ✅ Siempre 0 |
| Build reproducibilidad | `tsc -p tsconfig.build.json` determinista | ✅ `build:clean` obligatorio |
| copilot.db tablas STRICT Bloque B | 8/8 · SCHEMA_VERSION≥1 | ✅ Migraciones 0001 up/down |
| copilot.db tablas STRICT Bloque C | 7/7 · SCHEMA_VERSION=2 | ✅ Migraciones 0002 up/down reversibles |
| Ports Hex implementados | 11/11 total (9 CopilotDbLocalStore + 2 Live: NowPlayingSourcePort · LiveDJCheckpointPort) | ✅ LocalFirst por defecto; SQLite driver reemplazable sin tocar domain |
| Audio Intelligence V1 determinista | ✅ mood+structure same input=same output · cache RUN/SKIP/RUN 3 stages | ✅ F47-51 6 suite tests PASS |
| DJ Intelligence V2 integrado | ✅ Profile v2 retrocompat · personal_transition_score + ContextTag constraints · Semantic Retrieval offline 32d | ✅ F52-55 10 suite tests PASS Bloque E |
| LiveDJ Context V1 integrado | ✅ NowPlayingPort safe · LiveDJContext checkpoint 30s · recommendLive slot hard constraints · EnergyCurve planned vs live deviation±0.05 | ✅ F56-59 9 suite tests PASS Bloque F |
| Git cleanliness | `.gitignore` filtrado correcto (release/ 557MB NO al repo) | ✅ Verificado en `git status --porcelain` |
| Electron DMG verificado | 132,1 MB arm64 + ZIP + blockmap + latest-mac.yml | ✅ `scripts/verify-release-artifacts.ts` exit 0 |

## FASE 66 — MUSICAL INTELLIGENCE V2

**Estado:** ✅ Completada. Typecheck, suite y Electron build validados localmente por el proyecto.

### Alcance

- DSP determinista sobre PCM sin dependencias runtime nuevas.
- RMS / nivel energético.
- dynamic range.
- zero-crossing/rhythmic density.
- spectral centroid.
- confidence y quality flags.
- provider HTTP de embeddings compatible con el contrato `SemanticEmbeddingProvider`.
- HTTPS obligatorio.
- validación de dimensiones.
- orden determinista de vectores.
- compatibilidad con el semantic index existente sin cambiar sus consumidores.

### Archivos

- `src/audio/audio-musical-intelligence-v2.ts`
- `src/audio/audio-musical-intelligence-v2.test.ts`
- `src/intelligence/semantic-embedding-provider-v2.ts`
- `src/intelligence/semantic-embedding-provider-v2.test.ts`

### Gate

```text
pnpm typecheck
pnpm exec node --import tsx --test "src/**/*.test.ts"
pnpm electron:build
```

La Fase 66 no se considera cerrada hasta que los tres gates pasen.


## FASE 67 — PERSONALIZACIÓN DJ + OPTIMIZACIÓN CONTINUA

**Estado:** 🟡 Implementación completada; pendiente de validación local.

### Alcance

- Overlay determinista de personalización sobre RecommendationEngine.
- Preferencias por género, artista, BPM, energía y key.
- Penalización de preferencias negativas sin sustituir hard constraints.
- Confidence de personalización.
- Ranking reproducible y explainable.
- Tests de personalización y ranking.

### Archivos

- `src/personalization/personalization-v2.ts`
- `src/personalization/personalization-v2.test.ts`
- `src/recommendations/recommendation-types.ts`
- `src/recommendations/recommendation-engine.ts`
- `src/recommendations/recommendation-engine.test.ts`

### Arquitectura

```text
Hard Constraints
      ↓
Candidate Generation
      ↓
Deterministic Scoring
      ↓
Personalization V2
      ↓
Ranking
      ↓
Explanation
```

### Gate

```text
pnpm typecheck
pnpm exec node --import tsx --test "src/**/*.test.ts"
pnpm electron:build
```

La Fase 67 no se considera cerrada hasta que los tres gates pasen.
