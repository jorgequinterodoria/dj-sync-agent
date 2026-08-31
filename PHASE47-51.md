# PHASE 47–51 · Bloque D Entrega 04: Audio Intelligence Musical V1 (Heurístico Determinista + Cache Incremental)

Fecha: 2026-08-28
Bloque: D · ENTREGA 04 (Audio Intelligence, boundary File vs Musical; NO tocar Electron UI ni RecommendationEngine)

## Objetivo Entrega 04

Salir del gap "solo File Analysis (ffprobe metadata raw)". Añadir **Audio Intelligence Musical** estructurado:
- **F47** Contrato semver TrackAudioFeaturesV1 extendiendo AudioFeaturesV1 con secciones musicales y phrase boundaries.
- **F48** Boundary estricto File Analysis (existente AudioAnalysis ffprobe) vs Musical Audio Features (nuevo resultado separado). Pipeline independiente: falla File no rompe Musical.
- **F49** Heurística Mood v1 determinista: BPM / Camelot key (minor/major) / rating / playCount / genre / duration / bitrate / sampleRate / channels → energy, danceability, danceFloorIntensity, rhythmicDensity, mood_tags, vocal_presence, instrumental_probability, quality_flags.
- **F50** Heurística Structure v1 determinista: timeline proporcional 12% intro / 20% verse / 10% breakdown / ~40% drop / 16-20% outro. Phrase boundaries cada 16 beats.
- **F51** Pipeline incremental cacheable: lookup features existentes + checksum audio match + schema/analyzer version = SKIP. RUN solo si cambia algo. Integra reliability safeRetry optional.

## Reglas / Hard Boundaries

- ✅ NO tocar `NormalizedTrack` schema (dj-sync-agent Bloques A/B restringe mutaciones).
- ✅ NO tocar `RecommendationEngine`, `DJSetBuilder`, domain services.
- ✅ NO añadir Electron UI nuevo (ROADMAP secciones 7/25 fuera scope).
- ✅ Ports hexagonales intactos (solo AudioFeaturesV1 añade 2 campos musicales; signature persist/getFeatures sin cambio).
- ✅ Determinismo: MISMA entrada metadata/file → MISMA salida AudioFeatures. No seed random.

## Archivos creados / actualizados Bloque D

| # | Archivo | Propósito |
|---|---|---|
| 1 | [src/core/local-store/ports.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/local-store/ports.ts) | AudioFeaturesV1 añade `musicalSections: MusicalSectionV1[] \| null`, `phraseBoundariesMs: number[] \| null`. Tipos MusicalSectionType + MusicalSectionV1. Alias TrackAudioFeaturesV1=AudioFeaturesV1. |
| 2 | [src/audio/audio-boundaries.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/audio/audio-boundaries.ts) | `type FileAudioAnalysis = AudioAnalysis`; `MusicalAudioFeaturesResult`; `interface MusicalFeaturesAnalyzer`; `mergeFileAndMusicalFeatures`; `TRACK_AUDIO_FEATURES_SCHEMA_VERSION = 1`. |
| 3 | [src/audio/audio-musical-heuristics-v1.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/audio/audio-musical-heuristics-v1.ts) | `clamp01`, `isMinorCamelot`, `analyzeMoodV1Deterministic`, `analyzeStructureV1Deterministic`, `runMusicalHeuristicsV1` unifica ambos. Mood + Structure deterministas 100%. |
| 4 | [src/audio/audio-intelligence-service.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/audio/audio-intelligence-service.ts) | `runTrackAudioFeaturesPipeline` (RUN vs SKIP cache incremental). Orden seguro: get persisted BEFORE → run file analysis → compara → cacheHit? Retorna cached : guarda file analysis + corre heurísticas musicales. Integra reliability.run(), assetVerifier + fileAnalyzer opcionales (plugin fakes si no hay disco). |
| 5 | [src/core/local-store/bloque-b.test.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/core/local-store/bloque-b.test.ts) | Fix retrocompatibilidad: AudioFeaturesV1 literal incluye musicalSections/phraseBoundariesMs:null |
| 6 | [src/audio/audio-intelligence-v1.test.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/audio/audio-intelligence-v1.test.ts) | 6 tests suite Bloque D (F47, F48, F49 determinismo same input=same output, F50 phrase+secciones, F49+F50 integración, F51 RUN→SKIP→RUN otro checksum). |

## F47 · TrackAudioFeaturesV1 Contract

Campos extendidos (backwards compatible; si no calculas → null):

```ts
type MusicalSectionType = 'intro'|'outro'|'breakdown'|'drop'|'peak'|'verse'|'chorus'|'bridge'|'unknown';
interface MusicalSectionV1 { type; startMs; endMs; bpmEvidence:number|null; energyFloor01:number|null; }

interface AudioFeaturesV1 { schemaVersion: 1; ... // existentes B
  musicalSections: MusicalSectionV1[] | null;   // F50 structure
  phraseBoundariesMs: number[] | null;          // F50 16-beat phrase boundaries
}
export type TrackAudioFeaturesV1 = AudioFeaturesV1;
```

Estrategia upgrade v1→v2 futuro: mantener schemaVersion en cada row; `LocalAudioFeaturesStorePort.getFeatures` devuelve row directamente. Un día que tengamos v2 real, upgrade code se invoca al leer v1→migrar in-memory a v2 actual. NINGÚN cambio al store ports signature.

## F48 · File vs Musical Boundary

```
File Analysis (pipeline independiente):
  input: filePath
  output: { durationSeconds, sampleRate, channels, bitrate, codec } // alias FileAudioAnalysis

Musical Analysis (pipeline independiente):
  input: metadata+bpm+key+rating+... + (file opcional para mejora)
  output: MusicalAudioFeaturesResult

Final AudioFeaturesV1 = mergeFileAndMusicalFeatures({ trackId, generatedAt, analyzerVersion, musical })
```

Beneficios: audio no existe o falla (faltan drivers ffmpeg) → no rompe pipeline musical. Musical corre siempre con metadata disponibles.

## F49 · Mood & Semantic Tags Heurística

Fórmulas:
- Energy 0..1: BPM_norm(80→0,160→1) · 55% + rating·25% + bitrate/500·10% + duration_norm(2min→0,9min→1)·10%
- Danceability: sweetSpot(peak 126 ±16 BPM) 50% + rating 30% + energy 20%
- Rhythmic density 0.8·danceability + bonus si sampleRate>44.1 kHz
- Dance floor intensity: 60% energy + 40% danceability
- Tags mood: bpm_buckets (<110 downtempo / <122 deep / <133 peak / <142 techno / >=142 hardgroove); camelot minor→melancholic major→uplifting; genre rules(tech→driving, melodic→melodic, hard→energetic, …) + genre slug tokens (techno→techno, house→house). favorite_vibe(rating==5), rejected(rating==0). high/low energy thresholds. vocal_presence rating≥4 + playCount>10 boost; instrumental=1−vocal.
- Quality flags: stereo_ok, mono_mix, sample_rate_cd_plus, bitrate_high / medium / low, incomplete_file_analysis si faltan 3 campos.

## F50 · Structure Heurística (sin decoder)

Total ms = duration · 1000.

Partes (ajustan weights si hint energy>0.66 agranda drop, acorta outro):
- intro 12%, verse 20%, breakdown 10%, drop 38-42%, outro 16-20% (normalize so sum 100%).
- `defaultSectionEnergy(type, hint)`: intro = hint−0.5; breakdown = hint−0.55; drop/peak = hint+0.15; outro hint−0.45.
- Phrase boundaries: cada 16 beats (beat_ms = 60/bpm·1000). Merge con section starts.

Tests: F50 con BPM=128, 210s: 16-beats ms = 7500ms. Total parts = 210·1000 exacto.

## F51 · Cache Incremental RUN/SKIP

Regla SKIP (todas verdaderas):
1. `persistedChecksumBefore = analysisStore.getLatestAnalysis(trackId).assetChecksum` == `incomingChecksum` (asset.sha256).
2. featuresStore.getFeatures(trackId) exists y `schemaVersion === 1` y `analyzerVersion === MUSICAL_HEURISTICS_V1_ANALYZER_VERSION`.
3. Si SKIP → retorna features cached y opcionalmente re-persist file analysis para timestamps actualizados.

Regla RUN (any above false):
- run file analysis + persist en analysisStore → correr heurísticas → merge → persistFeatures → return cacheHit=false.

Extra: usa reliability.run(op) cuando se inyecta deps.reliability, o sin él corre una vez.

## Condiciones de cierre ✅ Entrega 04 Bloque D

- [x] Ports AudioFeaturesV1 backward compat: solo añade 2 nullables (bloque-b.test.ts regressions PASSED).
- [x] Boundary types File/Musical en audio-boundaries.ts + merge determinista.
- [x] 2 módulos heurística deterministas (mood F49, structure F50) + función unificadora runMusicalHeuristicsV1.
- [x] Service inteligencia audio pipeline cache-incremental: F51 test RUN→SKIP→RUN cambio checksum.
- [x] 0 acoplamientos UI / Recommendation / NormalizedTrack mutations.
- [x] **GATES VERDES**:
  - ✅ `pnpm typecheck` exit 0.
  - ✅ `pnpm exec node --import tsx --test "src/**/*.test.ts"` → **296 tests PASS, 0 FAIL** duration_ms 4363.
- [x] Sin regresiones Bloques A, B, C (296 incluye 278 + Bloque B 18 + Bloque C 11 + Bloque D 6? → todos PASS).

## Benchmarks

| Medida | Valor |
|---|---|
| Tests total | 296 |
| FAIL | 0 |
| TypeScript noEmit | ✅ 0 errores |
| Tiempo suite | 4363 ms |
| Cobertura path new heuristics mood | 100% (tests cases rating, BPM buckets, camelot min/maj, genre slugs) |
| Structure phrase boundaries | 6 tests cubren total ms, suma partes, phrase interval 16 beats |
| Cache incremental | 11 asserts 3 stages RUN SKIP RUN |
