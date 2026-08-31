import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AudioFeaturesV1, MusicalSectionType } from '../core/local-store/ports.js';
import { InMemoryCopilotDbStore } from '../core/local-store/in-memory-store.js';
import { MUSICAL_HEURISTICS_V1_ANALYZER_VERSION, runTrackAudioFeaturesPipeline, TRACK_AUDIO_FEATURES_SCHEMA_VERSION, type TrackAudioMetadataInput } from './audio-intelligence-service.js';
import {
  analyzeMoodV1Deterministic,
  analyzeStructureV1Deterministic,
  isMinorCamelot,
  runMusicalHeuristicsV1,
  clamp01,
} from './audio-musical-heuristics-v1.js';
import { mergeFileAndMusicalFeatures, TRACK_AUDIO_FEATURES_SCHEMA_VERSION as BOUNDARY_SCHEMA } from './audio-boundaries.js';
import type { AudioAnalysis } from './audio-analysis.js';

void describe('PHASE47-51 · Bloque D Audio Intelligence Musical', () => {
  void it('F47 · AudioFeaturesV1 schema v1 incluye musicalSections + phraseBoundariesMs; alias TrackAudioFeaturesV1', () => {
    const f: AudioFeaturesV1 = {
      schemaVersion: 1,
      generatedAt: '2026-08-28T00:00:00.000Z',
      analyzerVersion: MUSICAL_HEURISTICS_V1_ANALYZER_VERSION,
      trackId: 't1',
      energy: 0.7,
      danceability: 0.6,
      danceFloorIntensity: 0.65,
      rhythmicDensity: 0.5,
      moodTags: ['techno'],
      vocalPresence: 0.4,
      instrumentalProbability: 0.6,
      musicalSections: [
        { type: 'intro', startMs: 0, endMs: 10000, bpmEvidence: 126, energyFloor01: 0.2 },
      ],
      phraseBoundariesMs: [30476, 60952],
      qualityFlags: ['stereo_ok'],
    };
    assert.equal(f.schemaVersion, TRACK_AUDIO_FEATURES_SCHEMA_VERSION);
    assert.ok(Array.isArray(f.musicalSections));
    assert.equal(f.musicalSections![0]!.type, 'intro');
    assert.ok(f.phraseBoundariesMs!.length >= 2);
    assert.equal(BOUNDARY_SCHEMA, 1);
  });

  void it('F48 · mergeFileAndMusicalFeatures boundary: file analysis pipeline separado, musical combinado ok', () => {
    const file: AudioAnalysis = {
      durationSeconds: 210, sampleRate: 44100, channels: 2, bitrate: 320, codec: 'mp3',
    };
    void file;
    const result = mergeFileAndMusicalFeatures({
      trackId: 't1',
      generatedAt: '2026-08-28T00:00:00Z',
      analyzerVersion: MUSICAL_HEURISTICS_V1_ANALYZER_VERSION,
      musical: {
        energy: 0.8, danceability: 0.7, danceFloorIntensity: 0.78, rhythmicDensity: 0.6,
        moodTags: ['peak'], vocalPresence: 0.3, instrumentalProbability: 0.7,
        musicalSections: null, phraseBoundariesMs: null, qualityFlags: [],
      },
    });
    assert.equal(result.trackId, 't1');
    assert.equal(result.energy, 0.8);
    assert.equal(result.musicalSections, null);
    assert.equal(result.moodTags[0], 'peak');
  });

  void it('F49 · analyzeMoodV1Deterministic: BPM 126 + rating 5 = energy clamp, minor key = melancholic, determismo mismo input = mismo output', () => {
    const r1 = analyzeMoodV1Deterministic({
      bpm: 126, musicalKey: '8A', rating: 5, playCount: 20, genre: 'Techno',
      durationSeconds: 300, bitrate: 320, sampleRate: 44100, channels: 2,
    });
    const r2 = analyzeMoodV1Deterministic({
      bpm: 126, musicalKey: '8A', rating: 5, playCount: 20, genre: 'Techno',
      durationSeconds: 300, bitrate: 320, sampleRate: 44100, channels: 2,
    });
    assert.ok(r1.energy != null && r1.energy > 0.5, 'energy');
    assert.ok(r1.danceability != null && r1.danceability > 0.6, 'danceability');
    assert.ok(r1.moodTags.includes('melancholic'));
    assert.ok(r1.moodTags.includes('favorite_vibe'));
    assert.ok(r1.moodTags.includes('techno'));
    assert.ok(r1.moodTags.includes('driving'));
    assert.deepEqual(r1, r2);

    const major = analyzeMoodV1Deterministic({
      bpm: 128, musicalKey: '1B', rating: 3, playCount: 1, genre: 'House',
      durationSeconds: 240, bitrate: 256, sampleRate: 44100, channels: 2,
    });
    assert.ok(major.moodTags.includes('uplifting'), 'major uplifting');
    assert.equal(isMinorCamelot('1B'), false);
    assert.equal(isMinorCamelot('1A'), true);
    assert.equal(isMinorCamelot(''), null);
    assert.equal(clamp01(-0.01), 0);
    assert.equal(clamp01(2.0), 1);
    assert.equal(clamp01(null), null);
  });

  void it('F50 · analyzeStructureV1Deterministic: BPM 128, 210s → phrase boundaries cada 16beats = 7500ms; secciones intro/verse/breakdown/drop/outro suman totalMs', () => {
    const s = analyzeStructureV1Deterministic({ bpm: 128, durationSeconds: 210, energyHint01: 0.8 });
    assert.ok(s.musicalSections);
    const total = 210 * 1000;
    assert.equal(s.musicalSections![0]!.type, 'intro');
    assert.equal(s.musicalSections![s.musicalSections!.length - 1]!.type, 'outro');
    const sumParts = s.musicalSections!.reduce((acc, p) => acc + (p.endMs - p.startMs), 0);
    assert.equal(sumParts, total);
    const expectedFirstPhrase = Math.round(((60 / 128) * 1000) * 16);
    assert.ok(s.phraseBoundariesMs!.includes(expectedFirstPhrase));
    assert.ok(s.phraseBoundariesMs!.includes(0)); // intro start
  });

  void it('F49+50 · runMusicalHeuristicsV1 integra mood + structure deterministic', () => {
    const meta = { trackId: 't-heur', metadata: { bpm: 122, musicalKey: '5A', rating: 4, playCount: 5, genre: 'Melodic Techno', durationSeconds: 280, bitrate: 320, sampleRate: 48000, channels: 2 }, bpm: 122, durationSeconds: 280 };
    const a = runMusicalHeuristicsV1(meta);
    const b = runMusicalHeuristicsV1(meta);
    assert.deepEqual(a, b);
    assert.ok(a.musicalSections!.length >= 5);
    assert.ok(a.moodTags.includes('melodic'));
    assert.ok(a.qualityFlags.includes('sample_rate_cd_plus'));
  });

  void it('F51 · runTrackAudioFeaturesPipeline incremental cache: RUN luego SKIP (mismo checksum) sobre InMemory store', async () => {
    const store = new InMemoryCopilotDbStore();
    const fileAnalysis: AudioAnalysis = { durationSeconds: 240, sampleRate: 44100, channels: 2, bitrate: 320, codec: 'mp3' };
    const asset = { algorithm: 'sha256' as const, bytesRead: 12000, checksum: 'sha256:abc123', path: '/tmp/t.mp3', size: 12000 };
    const meta: TrackAudioMetadataInput = { trackId: 'track-cache-1', filePath: '/tmp/t.mp3', bpm: 128, musicalKey: '10A', rating: 5, playCount: 10, genre: 'Techno', durationSeconds: 240 };
    const fileAnalyzer = async (_fp: string) => fileAnalysis;
    const assetVerifier = async (_fp: string) => asset;

    const first = await runTrackAudioFeaturesPipeline(meta, {
      fileAnalyzer, assetVerifier, analysisStore: store, featuresStore: store,
    });
    assert.equal(first.cacheHit, false);
    assert.equal(first.features.schemaVersion, 1);
    assert.ok(Array.isArray(first.features.musicalSections));
    assert.ok(first.features.musicalSections!.length >= 5);

    const second = await runTrackAudioFeaturesPipeline(meta, {
      fileAnalyzer, assetVerifier, analysisStore: store, featuresStore: store,
    });
    assert.equal(second.cacheHit, true, 'segunda llamada con mismo checksum debe ser cache SKIP');
    assert.deepEqual(second.features, first.features);

    // Mismo track, distinto checksum → RUN
    const newAsset = { algorithm: 'sha256' as const, bytesRead: 12000, checksum: 'sha256:xyz456', path: '/tmp/t.mp3', size: 12000 };
    const third = await runTrackAudioFeaturesPipeline(meta, {
      fileAnalyzer, assetVerifier: async () => newAsset, analysisStore: store, featuresStore: store,
    });
    assert.equal(third.cacheHit, false, 'distinto checksum = run');
    assert.notEqual(third.cacheBasis.incomingChecksum, first.cacheBasis.incomingChecksum);
  });
});
