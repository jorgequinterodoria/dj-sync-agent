# CONTINUITY · dj-sync-agent Bloques A→H · Roadmap v2 (2026-08-28)

> **Objetivo de este documento**: Si reinicias otro chat (pierdes contexto), leer **solo este archivo primero** te da todo lo necesario para **CONTINUAR DESDE EL PUNTO ACTUAL** sin repetir trabajo. Incluye:
> 1. Resumen de bloques **REALIZADOS** con fechas cierre, KPIs, archivos creados, commands gates.
> 2. Bloques **FALTANTES** en orden estricto (Entrega 06 Bloque F al Entrega 08 Bloque H + Entrega 01 Bloque A).
> 3. **Pruebas GATES obligatorias por bloque** (copia/pegar commands).
> 4. **Hard boundaries / Constraints user permanentes** (NO UI, NO Rekordbox writes, Local First).
> 5. **Archivos vivos de documentación** y su propósito.

---

## 1. Estado Actual · Workspace

- **Rama git activa**: `feat/audio-analysis-boundary`
- **Carpeta proyecto**: `/Users/jorgequintero/Documents/GitHub/dj-sync-agent`
- **Tech stack**: Electron 44 · Node 24 (en typecheck pide 24, terminal actual puede ser 22.12 - ignore engine warnings) · TypeScript strict · SQLite schema STRICT 15 tablas copilot.db v2 · `better-sqlite3` no añadido todavía (adapter default InMemoryCopilotDbStore) · electron-updater v6.3.9 funcional · Distribución GitHub Releases v0.9.4 · Supabase optional default OFF
- **Config paths**:
  - Settings GUI: `~/.config/dj-sync-agent/settings.json` (0600 permissions, carpeta 0700)
  - Credenciales legacy Copilot: `~/.config/dj-sync-agent/copilot.env`
  - Credenciales legacy Sync: `~/.config/dj-sync-agent/sync-watch.env`
  - Target copilot.db SQLite real: `~/.config/dj-sync-agent/copilot.db`
- **Comando TESTS OFFICIAL user (REEMPLAZA `pnpm test`) — USAR SIEMPRE ESTE**:
  ```bash
  pnpm exec node --import tsx --test "src/**/*.test.ts"
  ```
- **Comando TYPECHECK official**: `pnpm typecheck` (tsc --noEmit exit 0)
- **Último state gates 28/08/2026 Bloque H wiring (H1-H11 DONE)**: pnpm typecheck exit 0 · tests 315 PASS / 0 FAIL · duration_ms ~5059ms · monotónico 315 · UI shell 8 vistas 80% wired.

---

## 2. Constraints Permanentes (NUNCA saltarte)

1. **NO Electron UI changes antes Entrega 08 Bloque H.** Entregas 02→05 Bloques B/C/D/E solo core/runtime/audio/intelligence.
2. **Default Local First 100% sin Supabase.** Supabase se activa solo si `SUPABASE_URL + SUPABASE_ANON_KEY` existen. Core Ports NUNCA dependen de Supabase.
3. **NO writes en Rekordbox master.db.** Solo se permite Bloque G3 Entrega07 Y CON 2FA Approval Flow.
4. **NO reemplazamos RecommendationEngine ni DJSetBuilder con LLM.** LLM explica, no puntúa. Añadimos signals aditivas (F53, F54, F55) nunca reemplazamos score base.
5. **Architecture Hexagonal Ports & Adapters intacto.** Todo storage implementa Ports definidos en `src/core/local-store/ports.ts`. Cambiar adapter InMemory → SQLite (future file `sqlite-store.ts`) NUNCA toca ports signatures ni domain code.
6. **Tests user command siempre PASSING.** Cada nuevo Bloque incrementa NNN (tests totales) de forma monotónica. Si tests fallan = entrega NO cerrada.

---

## 3. Resumen Bloques & Entregas · REALIZADOS ✅

| Entrega # | Bloque | Fases | Fecha cierre | Status | Archivos clave creados / modificados | Tests final | Gates final |
|---|---|---|---|---|---|---|---|
| **Entrega 02** | 🟢 **Bloque B** | 38-42 | 28-08-2026 | ✅ CERRADA | `src/core/local-store/{schema.ts,types.ts,ports.ts,codec.ts,in-memory-store.ts,migrations/0001_initial.ts,index.ts}` · tests `schema.test.ts` · `local-read-model.test.ts` · `bloque-b.test.ts` | 278 PASS | typecheck 0 · tests 0 FAIL |
| **Entrega 03** | 🟢 **Bloque C** | 43-46 | 28-08-2026 | ✅ CERRADA | `src/core/local-store/{schema-v2.ts,bloque-c.ts,migrations/0001_initial.ts extended → 2 migs}` · `schema-v2.test.ts` · `bloque-c.test.ts`. Ports renombrado Intelli (B) vs Behavior (C) para no colisionar: `persistIntelligenceProfile/getIntelligenceProfile` (B), `persistBehaviorProfile/getBehaviorProfile/getLatestBehaviorProfile` (C) | 290 PASS | typecheck 0 · tests 0 FAIL |
| **Entrega 04** | 🟢 **Bloque D** | 47-51 | 28-08-2026 | ✅ CERRADA | Nuevos: `src/audio/audio-boundaries.ts` · `src/audio/audio-musical-heuristics-v1.ts` · `src/audio/audio-intelligence-service.ts` · `src/audio/audio-intelligence-v1.test.ts`. Actualizados: `ports.ts AudioFeaturesV1 musicalSections:null|MusicalSectionV1[] · phraseBoundariesMs:null|number[]` retrocompat · `bloque-b.test.ts` añade 2 campos null en features literal | 296 PASS | typecheck 0 · tests 0 FAIL |
| **Entrega 05** | 🟢 **Bloque E** | 52-55 | 28-08-2026 | ✅ CERRADA | Nuevos: `src/intelligence/dj-intelligence-v2.ts` · `intelligence-profile-v2.ts` · `semantic-retrieval-v1.ts` · `dj-intelligence-v2.test.ts`. Actualizados: `intelligence-engine.ts INTELLIGENCE_ENGINE_VERSION bumped 2.0.0` | **306 PASS** | typecheck 0 · tests 0 FAIL |
| **Entrega 06** | 🟢 **Bloque F** | 56-59 | 28-08-2026 | ✅ CERRADA | Nuevos `src/core/live/` carpeta 5 archivos: `now-playing-port.ts` (NowPlayingSourcePort + Manual + Rekordbox stub safe) · `live-dj-context-state.ts` (LiveDJContextService + checkpoint 30s + InMemoryCheckpointStore) · `live-recommend.ts` (recommendLive slot-aware + exclusion hard constraints merged) · `live-energy-curve-tracker.ts` (EnergyCurve planned 7 stages + deviation threshold 0.25 ±targetEnergy 0.05) · `live-dj.test.ts` (9 subtests). Docs `PHASE56-59.md` creado. | **315 PASS** | typecheck 0 · tests 0 FAIL · 0 UI Electron · 0 writes Rekordbox · RecommendationEngine intact |

### Detalle Phases de cada bloque REALIZADO
1. **Bloque B (Entrega02 F38-42)**: copilot.db v1 SCHEMA_VERSION=1 8 tablas STRICT, 5 ports Hex (LocalReadModel/AudioAnalysis/AudioFeatures/IntelligenceProfile/SyncRuns) + InMemoryCopilotDbStore adapter + migrations/0001 reversible. Docs PHASE38.md→PHASE42.md.
2. **Bloque C (Entrega03 F43-46)**: SCHEMA_VERSION=2 15 tablas STRICT (8B+7C DJ Memory: dj_sessions/session_tracks/transitions/feedback/preferences/behavior_profiles/conversations). Migrations array 2 items [0001 initial B, 0002 add C]. 4 ports nuevos (DJHistory/Preferences/BehaviorProfiles/ConversationMemory). `store.asConversationMemoryStore()` adapter thin. Docs **PHASE43-46.md**.
3. **Bloque D (Entrega04 F47-51)**:
   - **F47 TrackAudioFeaturesV1 contract retrocompat**: `AudioFeaturesV1 += musicalSections: MusicalSectionV1[]|null` · `phraseBoundariesMs: number[]|null` · 9 tipos `MusicalSectionType` (intro/verse/chorus/bridge/breakdown/drop/peak/outro/unknown) · Alias `TrackAudioFeaturesV1 = AudioFeaturesV1`.
   - **F48 File/Musical Boundary**: `audio-boundaries.ts type FileAudioAnalysis = AudioAnalysis` · `MusicalAudioFeaturesResult` · `mergeFileAndMusicalFeatures`.
   - **F49 Mood V1 deterministic clamp**: `analyzeMoodV1Deterministic`. Energy BPM·55% rating·25% bitrate·10% duration·10%. Danceability sweetSpot 126±16. MoodTags BPM buckets + Camelot min/melancholic maj/uplifting + genre slugs (techno → 'techno', etc) + rating favorite_vibe/rejected_vibe + high/low energy thresholds. Quality flags stereo_ok / sample_rate buckets / bitrate / incomplete_analysis.
   - **F50 Musical Structure timeline 5 parts normalized sum=100% + phrases 16 beats**: `analyzeStructureV1Deterministic`. Weights intro 12% verse 20% breakdown 10% drop (energy_hint>0.66?42:38)% outro complement = exact durationSeconds*1000ms. Phrase boundaries each n*16*(60/BPM)*1000.
   - **F51 Pipeline cache incremental SAFE ORDER**: `runTrackAudioFeaturesPipeline`: **1) get persisted checksum ANTES run/persist análisis** (anti-falso-HIT). 2) run opcionalmente file analysis. 3) si incoming === persistedBefore + features existen match schema/analyzer → return cacheHit=true; else persistAnalysis luego heurística musical → merge → persistFeatures → cacheHit=false. Integra `deps.reliability?.run()` opcional sin romper si no existe.
   - Docs: **PHASE47-51.md**. KPIs Roadmap actualizados Audio Intelligence 40%→100%, DJ Memory 30%→100%.
4. **Bloque E (Entrega05 F52-55 HOY)**:
   - **F52 IntelligenceProfile v2 semver retrocompat**: `TrackIntelligenceProfileV2 extends Omit<TrackIntelligenceProfile,'schemaVersion'>` + `schemaVersion: 2` + new block `audioIntel` (energy01/danceability01/danceFloorIntensity01/vocalPresence01/instrumentalProbability/moodTags[]/qualityFlags[]/musicalSectionTypes[]/phraseCount). `upgradeProfileV1ToV2(profile, audioFeatures?)` in-place sin migration.
   - **F53 personal_transition_score sidecar no reemplaza engine**: `buildPersonalTransitionScore = 0.3*freq/10 +0.7*success_score`. `computeAdditionalScoring` retorna adjustment additive 0-100 (hist 15 + pref 12 + audio 18) multiplicado 0.1 sobre score deterministic base RecommendationEngine. Nuevos reasons codes.
   - **F54 DJ preference constraints hard mergeados**: `ContextTag` + `buildDefaultContextRule` (peak min124/max140). `buildPreferenceSignals` iterates 8 dimensions via `listValues` port → `applyPreferenceConstraints` sets excludedGenres/minBpm/maxBpm/allowedGenres en constraints Recommendation hard. `0 forbidden tracks` (excluded/too_slow/too_fast) nunca aparecen en top results.
   - **F55 Semantic Retrieval V1 Offline embeddings + local index**: `LocalSemanticIndexPort` interface. `SemanticEmbeddingProvider` {dimension, version, embed}. Default offline `createOfflineHashEmbeddingProvider(32)` tokens→sha256 normalized float32 32d L2 norm=1 deterministic. `createInMemorySemanticIndex` cosine sim topK default threshold 0.2. `SEMANTIC_RETRIEVAL_V1_DEFAULTS weight 0.15 (15%)`. LLM embeddings endpoint future plug same interface.
   - Docs: **PHASE52-55.md**. Tests 10 PASS nuevos. Roadmap Entrega05 marcada ✅.
5. **Bloque F (Entrega06 F56-59 HOY)**:
   - **F56 NowPlayingPort Hex + Rekordbox Stub SAFE**: `NowPlayingSourcePort {name, sourceType, getCurrent(), subscribe?, close?}`. `LiveNowPlaying` 14 campos (trackId, startPlaybackAt, elapsedMs, durationMs, bpm, musicalKey, energyHint01, sourceType, observedAt, title, artist, trackHash). `ManualNowPlayingSource` impl pushTrack/tickElapsed/clear. `RekordboxActiveCuePollingSource` stub ZERO SQL ZERO WRITES retorna null siempre (driver better-sqlite3 NO instalado todavía; cumplimiento constraint user 2FA writes). 2 tests PASS.
   - **F57 LiveDJContextService tick + checkpoint crash-safe 30s**: `LiveSlot = 'next_up'|'after_next'|'cool_down'`. `LiveDJContextCheckpoint schemaVersion:1` (sessionId, currentTrack, recentPlayedTrackIds[], energyTimeline[], slot, playedCount, elapsedSessionMs, derivedContextTag). `LiveDJCheckpointPort` InMemory impl. `LiveDJContextService.tick(dtMs)` consulta source.getCurrent(), actualiza elapsed, cuando trackId cambia → `appendPlayedTrack(prev)`. Auto-checkpoint 30s. `deriveContextTagFromCurrentEnergy`: playedCount≥totalTarget-2→closing; elapsed≥3h & energy≤0.45→afterhours; count=0→opening; energy<0.58→warmup; energy>0.62→peak; else build. 3 tests PASS.
   - **F58 recommendLive slot-aware (hard constraints exclusiones merged)**: Bug Fix F58.2 CRÍTICO anteriormente exclusiones recent no mergeadas en constraints.excludeTrackIds → solo pasaban a context.recentTrackIds (engine NO lo usaba para hard exclude). Fix: Set merge AMBOS arrays `recentTrackIdsForExclusion param + ctx.recentPlayedTrackIds` → `constraints.excludeTrackIds`. También merge artistas `excludeArtistNames`. Ranges HARD por slot: cool_down BPM -12/-2 (solo menor) & energy actual-0.25 a actual-0.02 (targetEnergy=max-0.05); next_up BPM -8/+8 energy -0.10/+0.12; after_next -10/+10 -0.15/+0.18. `filterCandidatesByEnergyRange` hard filter ANTES engine. `filterCandidatesByEnergyRange` cool_down saca 0.92 y 0.87 (max=0.84) F58.1 PASS. 2 tests PASS.
   - **F59 LiveEnergyCurveTracker V1 milestones + deviation adjust**: `LIVE_ENERGY_CURVE_V1_PROGRESS warmupEnd=0.2 buildEnd=0.5 peakEnd=0.85`. `buildPlannedEnergyCurve(totalDurationMinutes=60, samples=24)` 7 stages: opening(0.55)/warmup(0.70)/build(0.80)/peak(0.88)/bridge(0.80)/cooldown(0.65)/closing(0.40). `LiveEnergyCurveTracker`: appendSnapshot, getMilestones (start/warmupEndedAt/peakStartedAt/peakEndedAt/outroStartedAt/currentStage), summarizeDeviation threshold 0.25 = 'deviation_threshold_exceeded'. `adjustConstraintsForDeviation`: actual_below_planned → targetEnergy+0.05; actual_above_planned → targetEnergy-0.05 (solo targetEnergy existe en RecommendationConstraints types — minEnergy/maxEnergy NO existen → no usarlos). 2 tests PASS.
   - Docs: **PHASE56-59.md**. Tests 9 PASS nuevos (9/9 single-file). 315 PASS full suite (306+9). 0 Electron UI. 0 Rekordbox writes.
6. **Bloque H · Entrega08 (H1-H11 DONE · HOY 28/08 50% wiring UI Shell 8 vistas)**:
   - **H1 · 5 capas IPC 28 canales nuevos**: channels.ts (28 nuevos IDs) · contracts.ts DJSyncRendererApi extend recommend/setBuilder/history/preferences/live/workspace 6 grupos + interfaces SetAnalysisContext / DJSyncRecommendationServiceSnapshot / WorkspaceAggregateStats · ports.ts re-exports DJPreferenceDimension/Kind/DJSessionRow (antes import only) · register.ts handlers 22 IPC con lazy init + singleton InMemoryCopilotDbStore + 1s liveTickTimer + broadcastLiveUpdate · preload.cts contextBridge expose 6 grupos + live.subscribe wrapper.
   - **H2 · main.ts getSenderWebContents**: Opción `getSenderWebContents?: () => WebContents|null` para broadcast `live:update` snapshots.
   - **H3 · 4 stat-cards Inicio wired**: workspaceAggregateStats → `#stat-tracks / #stat-playlists / #stat-sets / #stat-hours / #stat-last-session`.
   - **H4 · NowPlaying global wired**: live.subscribe(cb) → `#np-title / #np-artist / #np-bpm / #np-key / #np-time-cur / #np-time-tot` + waveform bars `wv-played` clase según ratio % elapsed/duration.
   - **H5 · Vista #2 Biblioteca wired**: `library.list({limit 50, afterId, search})` → dense-table 7 cols (cover/title+artist/rating★/BPM pill/Key pill/Genre pill/Energy 4-level bar) + search input debounce on input + click row = `live.pushManualTrack` al NowPlaying.
   - **H6 · Vista #8 Ajustes wired**: `settings.get()/.save()` legacy para SYNC + Copilot config 6 campos + guardar `excludedGenres` comma-list como `preferences.saveExplicit(dimension='genre', kind='excluded')` multi. Toast settings-saved-toast visible 2.2s.
   - **H7 · Vista #6 Historial wired**: `history.listSessions(3)` → 3 cards `[data-session-card]` metadata title/when/meta/source.
   - **H8 · Vista #4 Sets Builder wired**: 6 inputs constraints → `setBuilder.build({trackIds=library 100 first, durationMinutes, constraints allowedGenres, targetEnergy, trackCount 22})` → banner OK + mini set-table rows con energy 4-level bars. Error banner si falla.
   - **H9 · Vista #3 Recomendaciones wired**: Click title pushManualTrack al NowPlaying (vista con data hardcoded placeholder H17 pendiente).
   - **H10 · register.ts fixes exactOptionalPropertyTypes**: `kind: input.kind !== undefined` if/else para listValues; occurredAt fallback a ISO si undefined; saveExplicit weight NO usa undefined assignment directo; recommendLive 1 arg not 2; registerIpcHandlers void return.
   - **H11 · Monotonicidad preservada**: 0 exports legacy production-ui-entry/renderer tocados. Todos bindings append-only al final renderer.ts con guardas `if (!api) return;`.
   - Docs: §5.1 ROADMAP.md GAP-01..GAP-10 = 10 funciones faltantes reales mapeadas a Bloque G (6 items) / Bloque H (4 items). Gates HOY: pnpm typecheck 0 · tests 315 PASS 0 FAIL.

---

## 4. Resumen Bloques & Entregas · FALTANTES ⏳ (orden ESTRICTO)

### Prioridad 1: Siguiente bloque por defecto
Orden según Roadmap: Entregas B→C→D→E→F **cerradas** (5 entregas) + H1-H11 (wiring UI baseline realizado HOY). Ahora, **siguiente bloque por defecto** cuando user dice `continúa el siguiente bloque`:

→ **Entrega 07 · Bloque G (Copilot Agent 2.0 + SQLite Persist + Library Filters + RekordboxWritePort frontera)** porque: (a) GAP-01 es crítico (todo en RAM sin persistencia), (b) GAP-07/GAP-08 son seguridad/operaciones reales, (c) Bloque G NO toca renderer (Bloque H ya tocó renderer; continuar H12-H18 después G). Solo si user dice "quiero acabar UI primero" → saltar a Entrega 08 H12-H18.

---

### ⚪ **FALTANTE 1 — Entrega 07 · Bloque G (60 + G2 + G3) Copilot 2.0 Agent final + Persistencia Local + Frontera SafeOps**

| Fase / ID | Tarea | Hard constraints que verificar | Puerta de calidad |
|---|---|---|---|
| 60 / GAP-07 | Tools list cerrada allow-list de CopilotAgent | Lista cerrada tools que el agente puede llamar: `library.search / library.get_track / recommend.next / recommend.set_slot / set.build / set.analyze / audio.analyze / history.last_session / live_context.get / settings.list` (TODAS bind a IPC renderer, NO filesystem directo). Nuevas tools = PHASE nueva. | Security test: invocar tool FUERA allowlist = `blocked by policy` |
| G2 / GAP-07 | Context Assembler integrado (DJ Memory + Live + Conversation + BehaviorProfile) | Copilot context inyecta últimos N conversation msgs + DJBehaviorProfile snapshot + last session transitions + live_context snapshot Bloque F + recommendation feedback último mes. Tokens total ≤ LLM budget * 0.8 (80%). Truncado oldest-first DETERMINISTA. | Budget test: 1000 mensajes antiguos → NO excede 80% budget. |
| G3 / GAP-08 | RekordboxWritePort frontera safe writes con Approval 2FA | `RekordboxWritePort { appendToTempPlaylist(id,tracks[]); createPlaylist(name); deleteTempPlaylist(id) }`. Implementación inicial mock local + XML export/import. **Approval 2FA mandatory** (Fase29 intacto) ANTES cualquier write. | Zero writes en master.db real. Integration test: writeRequest → approval DENIED → nada cambia. |
| G4 / GAP-01 | SQLite native driver + `sqlite-store.ts` reemplaza InMemory default | Añadir `better-sqlite3` a package.json · `SqliteCopilotDbStore implements CopilotDbLocalStore` · strict tables SCHEMA v2 Bloque C · migrations runner 0001/0002 idempotent · default adapter = file-based en `~/.config/dj-sync-agent/copilot.db 0600` · carpeta 0700. | Persistence test: write pref → kill process → restart → read pref = mismo valor. |
| G5 / GAP-02 + GAP-03 | Library API params extendidos + Playlist IPC | `library.list` acepta `{allowedGenres[], excludedGenres[], minBpm, maxBpm, musicalKeys[], minEnergy01, maxEnergy01, search}`. Nuevo IPC `playlist.list` + `playlist.get`. `workspaceAggregateStats.playlists` NO placeholder = length(playlist.list). | Test: library.list filtro genre House + BPM 124..128 → 0 tracks fuera del rango. |
| G6 / GAP-04 | Preferences.listValues render en store + IPC extend | Asegurar `listValues(dimension,kind?)` devuelve rows con `value/kind/weight/source/occurredAt`. Nuevo IPC `preferences.removeExplicit` delete row. | Tests: save → list → remove → list vacío. |

### � **FALTANTE 2 — Entrega 08 · Bloque H (H12–H18) Wiring runtime real UI Shell 8 vistas**
**ESTADO ACTUAL Bloque H**: H1–H11 ✅ realizado HOY (IPC 5 capas + 6 de 8 vistas wired baseline). **FALTAN H12–H18** (7 items):

| Fase | Tarea | Fuente datos IPC · Elementos DOM |
|---|---|---|
| H12 / GAP-06 | Historial `Ver set` botón → #5 Analisis Set | Click → `history.getSessionTracks(session_id)` → extraer `trackIds[]` → navegar #view-analisis (sidebar data-nav-view activa) → ejecutar `setBuilder.analyze` o `recommend.analyzeSet`. |
| H13 / GAP-06 | Vista #5 Analisis Set: 5 metrics + energy curve SVG + donut histogram | `analyzeSet({trackIds})` → 5 cols metrics (variedad/BPM range/genreCoverage/artistCount/repeatedArtistCount/warnings[]) + `energyCurve[] numbers re-fill stages SVG 7 gradient` + `donut key histogram count tracks per key`. |
| H14 / GAP-04 | Vista #8 Ajustes DJ Preferences | `preferences.listValues(dimension, kind='excluded')` render listas existentes de excluded/preferred genres/BPM ranges/keys/artists. Botón × por item = `preferences.removeExplicit(dim,val,kind)`. |
| H15 / GAP-02 | Dashboard #1 stat-card `#stat-playlists` NO placeholder | `playlist.list()` length → `workspaceAggregateStats.playlists` real en lugar de 0. |
| H16 / GAP-03 | Vista #2 Biblioteca toolbar avanzado (genre chips · BPM min/max · Camelot wheel key · energy sliders) | Construir object `library.list({...,allowedGenres,minBpm,maxBpm,musicalKeys,minEnergy,maxEnergy})` al cambiar filtros; re-render dense-table. Requiere Bloque G5 PARAMS EXTEND listos ANTES. |
| H17 / GAP-05 | Vista #3 Recomendaciones → datos REALES `recommend.recommend` | Si LiveDJ has currentNowPlaying: `ctx.currentTrackId = np.trackId`, `slot = next_up`, `limit 6`. Render 6 cards con artist/title/BPM/key/energy bar. Click card → pushManualTrack NowPlaying (ya implementado click). |
| H18 / GAP-10 | Cleanup main.ts `liveTickTimer` + IPC listeners sin leak | `registerIpcHandlers` devuelve `{ cleanup: () => void }` (firma void cambiada, ahora sí devolver cleanup) · `main.ts app.on('before-quit')` invoca cleanup. Memory leak test: 10 boot/close cycles NO listeners leak. |

### 🔵 **FALTANTE 3 — Entrega 01 · Bloque A (34-37) Roadmap sync + DJCore consolidation + Supabase optional + CI**
Pendiente desde principio del roadmap; user decidió ir B→C→D→E→F primero. Hacerlo cuando user mencione "main.ts está muy largo / CI / consolidar":
- F34 = sync docs ROADMAP (hecho parcial).
- F35 = extraer DJCore services de main.ts en archivos separados → main.ts ↓50% líneas.
- F36 = `LocalConversationMemoryStore` JSON/SQLite default activo sin SUPABASE vars.
- F37 = CI workflow typecheck → full tests → build.

### 🟢 **FALTANTE 4 — Entrega 09 bonus H19 Post-Bloque H (opcional)**
- H19 / GAP-09: `RekordboxActiveCuePollingSource` REAL (no stub). Poll cada 1s sobre master.db SQLCipher (readonly) usando driver better-sqlite3 instalado en G4. Detectar `ActiveCue changes → source.getCurrent() returns LiveNowPlaying` → push manual YA NO necesario. NO writes. Restricción: readonly SQL, NO UDPATE queries.

---

## 5. DOCUMENTACIÓN VIVA · Archivos que existen hoy

| Archivo | Propósito | Actualizado el |
|---|---|---|
| [ROADMAP.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/ROADMAP.md) | Plan A→H 8 entregas, tablas fases, calidad. Source of Truth narrativo. | Entrega06 Bloque F marcada ✅ + tests 315 · 28-08 HOY |
| [PHASE38.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE38.md) → [PHASE42.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE42.md) | Condiciones cierre Entrega 02 Bloque B. | 28-08 |
| [PHASE43-46.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE43-46.md) | Condiciones cierre Entrega 03 Bloque C. | 28-08 |
| [PHASE47-51.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE47-51.md) | Condiciones cierre Entrega 04 Bloque D Audio Intelligence. | 28-08 |
| [PHASE52-55.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE52-55.md) | Condiciones cierre Entrega 05 Bloque E DJ Intelligence 2.0 + gates obligatorios cada bloque. | 28-08 |
| [PHASE56-59.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE56-59.md) | Condiciones cierre Entrega 06 Bloque F LiveDJ. Acceptance Criteria, decisiones técnicas, Bug Fix F58.2, archivos creados, Gates ejecutados 315 PASS 0 FAIL. | 28-08 HOY |
| **ESTE ARCHIVO [CONTINUITY.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/CONTINUITY.md)** | **Al reiniciar chat LEER ESTE PRIMERO.** Resume bloque realizados, faltantes, constraints permanentes, commands gates, archivos docs. | 28-08 HOY |

---

## 6. PLANTILLA · Pasos a seguir al EMPEZAR CUALQUIER NUEVO BLOQUE X

1. **Setup gates baseline pre-cambio**: Ejecutar **1) `pnpm typecheck` 2) tests user command**. Anotar tests count (actual = 315, Bloque F cerrado).
2. **Crear TodoWrite con 6 items**: Fn-1, Fn-2, ..., Fn-N, tests, gates (typecheck+tests user), docs. Todo status pending.
3. **Implementar fases** sin romper ports: primero types/interfaces (ports.ts si necesario), luego archivos runtime nuevos, luego archivo tests Bloque X.
4. **Loop calidad**: `pnpm typecheck` (arreglar errores TS) → `pnpm exec node --import tsx --test "src/NUEVO_ARCHIVO.test.ts"` single pass → `pnpm exec node --import tsx --test "src/**/*.test.ts"` full suite 0 FAIL.
5. **Escribir PHASE docs**: Ej `PHASE56-59.md` con tabla Acceptance Criteria cerrados, archivos nuevos/modificados, decisions técnicas, siguiente bloque.
6. **Actualizar ROADMAP.md**: Bloque color → 🟢, Entrega ✅ cerrada, Tests pasan NNN incrementa monotónico, sección Calidad garantizada actualiza `Tests pass NNN/NNN` y añade fila si hay nueva capability.
7. **Actualizar ESTE CONTINUITY.md**: Añade el bloque recién cerrado a la Tabla §3 REALIZADOS y mueve FALTANTES §4 hacia arriba. NO OLVIDES actualizar `Último state gates` §1 (tests count y fecha).

---

## 7. Comandos Copiar/Pegar · OBLIGATORIOS Gates por bloque

> Reemplazar `NUEVO_BLOQUE.test.ts` por el test file real.

```bash
# 1) TypeScript SIN errores (puerta 1)
pnpm typecheck

# 2) Correr tests SÓLO del bloque nuevo (desarrollo rápido)
pnpm exec node --import tsx --test "src/intelligence/dj-intelligence-v2.test.ts"

# 3) Tests FULL SUITE oficial user (puerta 2 OBLIGATORIA antes cerrar)
pnpm exec node --import tsx --test "src/**/*.test.ts"
```

### Resultado esperado ANTES marcar entrega cerrada
```
ℹ tests 3XX (≥ 306 si Bloque F)
ℹ suites X
ℹ pass 3XX
ℹ fail 0
duration_ms YYYY
```
Y `pnpm typecheck` exit code **0** (sin output excepto engine warnings).

---

## 8. Links rápidos · Archivos clave para empezar Bloque G (Entrega 07)

- Copilot Agent tools registry + approval gate: [src/agent/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/agent/)
- Security approval boundary 2FA para writes (Fase29): [src/security/](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/security/)
- Context Assembler actual + CopilotContextProvider: [src/runtime/copilot-context-assembler.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/runtime/copilot-context-assembler.ts)
- Live DJ Context (Bloque F, usar en G2): [src/core/live/live-dj-context-state.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/live/live-dj-context-state.ts)
- DJBehaviorProfile Port para snapshot: [src/core/local-store/ports.ts LocalDJBehaviorProfileStorePort](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/local-store/ports.ts)
- RecommendationEngine intact para recommend.next tool: [recommendation-engine.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/recommendations/recommendation-engine.ts)

---

### Para el usuario final
Cuando abras el próximo chat y quieras continuar, escribe: **"lee CONTINUITY.md y continua el siguiente bloque"**. Esto evita resummaries manuales y no repetimos trabajo. Happy coding 🎧.
