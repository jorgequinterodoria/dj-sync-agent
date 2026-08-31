import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPersonalTransitionScore, buildPreferenceSignals, applyPreferenceConstraints, computeAdditionalScoring, contextOfTag } from './dj-intelligence-v2.js';
import type { DJTransitionRow } from '../core/local-store/types.js';
import type { DJPreferenceKind, DJPreferenceDimension } from '../core/local-store/types.js';
import type { AudioFeaturesV1 } from '../core/local-store/ports.js';
import type { RecommendationContext, TrackRecommendationCandidate, RecommendationConstraints } from '../recommendations/recommendation-types.js';
import { createRecommendationEngine } from '../recommendations/recommendation-engine.js';

import type { TrackIntelligenceProfile } from './intelligence-engine.js';
import { buildTrackIntelligenceProfileV2, upgradeProfileV1ToV2, isProfileV2, isProfileV1 } from './intelligence-profile-v2.js';
import {
  createOfflineHashEmbeddingProvider,
  createInMemorySemanticIndex,
  cosineSimilarity,
  toFloat32,
  SEMANTIC_RETRIEVAL_V1_DEFAULTS,
} from './semantic-retrieval-v1.js';
import { buildTrackSemanticDocument } from './semantic-document.js';

function baseProfile(): TrackIntelligenceProfile {
  return {
    schemaVersion: 1,
    engineVersion: '1.0.0',
    computedAt: '2026-08-28T00:00:00.000Z',
    metadata: { completenessScore: 80, presentFields: 8, totalFields: 10 },
    technical: { completenessScore: 70, availableFields: 5, totalFields: 8 },
    analysis: { available: true, status: 'completed', analysisRunId: 1, analysisVersion: 1, pipelineVersion: 'p1', featureCount: 8 },
    dj: { readinessScore: 85, engagementScore: 90, tempoBand: 'mid', durationBand: 'standard', keyPresent: true, genrePresent: true, artistPresent: true, fingerprintReady: true },
    audio: { qualityTier: 'lossy_high', bitrateKbps: 320, sampleRateHz: 44100, channels: 2, codec: 'mp3' },
    signals: { energy: 0.72, danceability: 0.6, valence: 0.5, loudnessLufs: -10, spectralCentroidHz: 2200, instrumentalness: 0.2, speechiness: 0.15, acousticness: 0.1 },
    provenance: { trackHash: 'abc123', rbLocalUsn: 1, analysisRunId: 1, analysisVersion: 1, pipelineVersion: 'p1' },
  };
}

function feature(energy: number, danceability: number, tags: string[]): AudioFeaturesV1 {
  return {
    schemaVersion: 1,
    analyzerVersion: 'heuristics-v1.0.0',
    trackId: 't1',
    generatedAt: '2026-08-28T00:00:00.000Z',
    energy: Math.round(energy * 10000) / 10000,
    danceability: Math.round(danceability * 10000) / 10000,
    rhythmicDensity: 0.7,
    danceFloorIntensity: 0.6,
    vocalPresence: 0.8,
    instrumentalProbability: 0.2,
    moodTags: [...tags].sort(),
    musicalSections: null,
    phraseBoundariesMs: null,
    qualityFlags: ['stereo_ok', 'bitrate_high'].sort(),
  };
}

function makeCandidate(opts: {
  trackId: string;
  artist?: string;
  genre?: string;
  bpm?: number;
  energy?: number;
  rating?: number;
  playCount?: number;
  key?: string;
}): TrackRecommendationCandidate {
  return {
    trackId: opts.trackId,
    artist: opts.artist ?? null,
    genre: opts.genre ?? null,
    bpm: opts.bpm ?? null,
    energy: opts.energy ?? null,
    rating: opts.rating ?? null,
    playCount: opts.playCount ?? null,
    key: opts.key ?? null,
  };
}

describe('Bloque E Entrega 05 · Fase 52 · IntelligenceProfile v2', () => {
  it('F52.1 Profile v1 se upgradea a v2 con nuevos campos audioIntel', () => {
    const v1 = baseProfile();
    assert.equal(isProfileV1(v1), true);
    const upgraded = upgradeProfileV1ToV2(v1, feature(0.72, 0.6, ['peak', 'driving']));
    assert.equal(isProfileV2(upgraded), true);
    assert.equal(upgraded.schemaVersion, 2);
    assert.equal(upgraded.audioIntel.schemaVersion, 1);
    assert.deepEqual(upgraded.audioIntel.moodTags, ['driving', 'peak']);
    assert.deepEqual(upgraded.audioIntel.qualityFlags, ['bitrate_high', 'stereo_ok']);
    assert.equal(upgraded.audioIntel.energy01, 0.72);
    assert.equal(upgraded.audioIntel.danceability01, 0.6);
    assert.equal(upgraded.signals.energy, 0.72);
    assert.equal(upgraded.signals.danceability, 0.6);
  });

  it('F52.2 buildTrackIntelligenceProfileV2 reescribe computedAt, retrocompat sin audioFeatures', () => {
    const base = baseProfile();
    base.signals.energy = null;
    base.signals.danceability = null;
    const v2 = buildTrackIntelligenceProfileV2({ base, now: '2026-08-28T10:00:00.000Z' });
    assert.equal(v2.computedAt, '2026-08-28T10:00:00.000Z');
    assert.equal(v2.audioIntel.energy01, null);
    assert.deepEqual(v2.audioIntel.moodTags, []);
  });

  it('F52.3 SemanticDocument construible desde profile v2', () => {
    const v2 = buildTrackIntelligenceProfileV2({ base: baseProfile(), audioFeatures: feature(0.8, 0.7, ['melodic']) });
    const v1Compat: TrackIntelligenceProfile = {
      ...v2,
      schemaVersion: 1,
    };
    const doc = buildTrackSemanticDocument(v1Compat, { trackId: 't-1' });
    assert.equal(doc.trackId, 't-1');
    assert.equal(doc.documentType, 'dj.track');
    assert.equal(typeof doc.contentHash, 'string');
    assert.equal(doc.contentHash.length, 64);
  });
});

describe('Bloque E · Fase 53 · personal_transition_score + RecommendationEngine signals', () => {
  it('F53.1 buildPersonalTransitionScore con history = personal, sin history = fallback', () => {
    const rows: Pick<DJTransitionRow, 'track_a_id' | 'track_b_id' | 'frequency' | 'success_score'>[] = [
      { track_a_id: 'A', track_b_id: 'B', frequency: 7, success_score: 0.85 },
      { track_a_id: 'A', track_b_id: 'C', frequency: 2, success_score: 0.3 },
    ];
    const hit = buildPersonalTransitionScore(rows, 'A', 'B');
    assert.equal(hit.fallback, false);
    assert.equal(hit.historyFrequency, 7);
    assert.equal(hit.successScore, 0.85);
    assert.ok(hit.personalScore != null && hit.personalScore > 0.7);
    const miss = buildPersonalTransitionScore(rows, 'A', 'Z');
    assert.equal(miss.fallback, true);
    assert.equal(miss.personalScore, null);
  });

  it('F53.2 computeAdditionalScoring combina history+preferences+audio en RecommendationResult', async () => {
    const engine = createRecommendationEngine({ id: () => 'rec-1', now: () => '2026-08-28T00:00:00.000Z' });
    const current = makeCandidate({ trackId: 'A', artist: 'Adam Beyer', genre: 'Techno', bpm: 128, energy: 0.7, rating: 5, playCount: 20, key: '8A' });
    const candidates = [
      makeCandidate({ trackId: 'B', artist: 'Charlotte de Witte', genre: 'Techno', bpm: 129, energy: 0.72, rating: 4, playCount: 10, key: '8B' }),
      makeCandidate({ trackId: 'C', artist: 'Adam Beyer', genre: 'Melodic Techno', bpm: 124, energy: 0.55, rating: 2, playCount: 1, key: '1A' }),
    ];
    const ctx: RecommendationContext = {
      deviceId: 'dev-1',
      request: 'next track',
      currentTrack: current,
      candidates,
      limit: 5,
      recentArtistNames: [],
    };
    const baseResult = engine.recommend(ctx);
    assert.ok(baseResult.recommendations.length >= 1);
    const transitionsLikeDJHistory: Pick<any, 'getTransitionsFor'> = {
      async getTransitionsFor(trackId: string) {
        if (trackId === 'A') {
          return [
            {
              track_a_id: 'A',
              track_b_id: 'B',
              frequency: 7,
              avg_duration_played_a_ms: 90_000,
              avg_duration_played_b_ms: 90_000,
              first_seen_at: '2026-08-20',
              last_seen_at: '2026-08-28',
              success_score: 0.85,
              created_at: '2026-08-20',
              updated_at: '2026-08-28',
            } satisfies DJTransitionRow,
          ];
        }
        return [];
      },
    };
    const feats = new Map<string, AudioFeaturesV1>();
    feats.set('A', feature(0.7, 0.65, ['peak', 'driving', 'techno']));
    feats.set('B', feature(0.72, 0.67, ['peak', 'driving', 'techno']));
    feats.set('C', feature(0.55, 0.5, ['warmup', 'melodic']));
    const topCandidate = baseResult.recommendations[0];
    assert.ok(topCandidate);
    const candidateObj = candidates.find((c) => c.trackId === topCandidate.trackId) ?? candidates[0]!;
    const additional = await computeAdditionalScoring(ctx, current, candidateObj, {
      history: transitionsLikeDJHistory,
      latestAudioFeatures: feats,
      contextTag: 'peak',
    });
    assert.ok(additional.adjustment > 0);
    assert.ok(additional.extraReasons.length >= 1);
    const bScore = baseResult.recommendations.find((r) => r.trackId === 'B')?.score ?? 0;
    assert.ok(bScore >= 70, `Techno same BPM B debe rankear alto, score=${bScore}`);
  });
});

describe('Bloque E · Fase 54 · DJPreference constraints aplicado Recommendation', () => {
  it('F54.1 exclusiones permanentes + context peak bloquean tracks invalidos', async () => {
    // listValues rollup rows (agrupadas by value): returns value/kind/totalWeight/lastOccurrence
    type ListRow = { value: string; kind: DJPreferenceKind; totalWeight: number; lastOccurrence: string };
    const rows: ListRow[] = [
      { value: 'techno', kind: 'preferred', totalWeight: 8, lastOccurrence: '2026-08-28' },
      { value: 'ambient', kind: 'excluded', totalWeight: -10, lastOccurrence: '2026-08-28' },
      { value: 'banned artist', kind: 'excluded', totalWeight: -100, lastOccurrence: '2026-08-28' },
    ];
    const preferencePort = {
      async listValues(args: { deviceId: string; dimension: DJPreferenceDimension }) {
        void args;
        return rows;
      },
    } as any;
    const signals = await buildPreferenceSignals(preferencePort, 'dev-1', 'peak');
    assert.ok(signals.exclusions.find((e) => e.value === 'ambient' && e.dimension === 'genre'));
    const baseConstraints: RecommendationConstraints = { excludeTrackIds: ['X'] };
    const peakConstraints = applyPreferenceConstraints(baseConstraints, signals, 'peak');
    assert.equal(peakConstraints.minBpm, 124);
    assert.equal(peakConstraints.maxBpm, 140);
    assert.ok((peakConstraints.excludedGenres ?? []).includes('ambient'));

    const engine = createRecommendationEngine({ id: () => 'rec-2', now: () => '2026-08-28T00:00:00.000Z' });
    const current = makeCandidate({ trackId: 'A', genre: 'Techno', bpm: 128, energy: 0.7 });
    const candidates = [
      makeCandidate({ trackId: 'ok1', genre: 'Techno', bpm: 130, energy: 0.75 }),
      makeCandidate({ trackId: 'excluded_genre', genre: 'Ambient', bpm: 120, energy: 0.35 }),
      makeCandidate({ trackId: 'too_slow', genre: 'Techno', bpm: 115, energy: 0.5 }),
      makeCandidate({ trackId: 'too_fast', genre: 'Techno', bpm: 150, energy: 0.9 }),
    ];
    const result = engine.recommend({
      deviceId: 'dev-1',
      request: 'next',
      currentTrack: current,
      candidates,
      constraints: peakConstraints,
      limit: 10,
    });
    const recommendedIds = new Set(result.recommendations.map((r) => r.trackId));
    assert.ok(recommendedIds.has('ok1'));
    assert.equal(recommendedIds.has('excluded_genre'), false, 'Ambient excluded via preference excludedGenres');
    assert.equal(recommendedIds.has('too_slow'), false, 'bpm 115 < peak min 124');
    assert.equal(recommendedIds.has('too_fast'), false, 'bpm 150 > peak max 140');
    void contextOfTag;
    void SEMANTIC_RETRIEVAL_V1_DEFAULTS;
  });

  it('F54.2 contextOfTag parsea valores conocidos a ContextTag', () => {
    assert.equal(contextOfTag('PEAK '), 'peak');
    assert.equal(contextOfTag('warm-up'), 'unknown'); // no-space parseado low, solo valores literales sin hyphen
    assert.equal(contextOfTag('closing'), 'closing');
    assert.equal(contextOfTag(null), 'unknown');
  });
});

describe('Bloque E · Fase 55 · Semantic Retrieval v1 offline embeddings local HNSW-lite', () => {
  it('F55.1 Offline Hash Embedding dimension OK + normalizacion (norm ~=1)', async () => {
    const provider = createOfflineHashEmbeddingProvider(32);
    assert.equal(provider.dimension, 32);
    const vs = await provider.embed([
      'Techno peak driving Adam Beyer melodic',
      'ambient chill afterhours slow relaxing',
    ]);
    const v1 = vs[0];
    const v2 = vs[1];
    assert.ok(v1 && v2);
    const f1 = toFloat32(v1);
    const f2 = toFloat32(v2);
    assert.equal(f1.length, 32);
    // Normalized vectors L2 norm close to 1
    const norm1 = Math.sqrt(f1.reduce((s, x) => s + (x ?? 0) * (x ?? 0), 0));
    assert.ok(Math.abs(norm1 - 1) < 0.05, `v1 L2 norm debe ser ~1, got ${norm1}`);
    const sim = cosineSimilarity(f1, f2);
    assert.ok(sim < 0.7, `Sim entre techno vs ambient esperada baja, got ${sim}`);
  });

  it('F55.2 InMemorySemanticIndex upsert + search topK por similitud', async () => {
    const provider = createOfflineHashEmbeddingProvider(32);
    const idx = createInMemorySemanticIndex();
    const texts = [
      { t: 't-1', content: 'Techno peak driving 130bpm acid' },
      { t: 't-2', content: 'Ambient afterhours relaxing chill 100bpm' },
      { t: 't-3', content: 'Melodic techno peak euphoric breakdown 128bpm' },
      { t: 't-4', content: 'Hardgroove peak 140bpm tribal percussive' },
    ];
    const docs = texts.map((x) => {
      const profile = baseProfile();
      const doc = buildTrackSemanticDocument(profile, { trackId: x.t });
      // Sobrescribe content para poder comparar semántica determinista por texto
      return { ...doc, content: x.content };
    });
    const embeddings = await provider.embed(docs.map((d) => d.content));
    await idx.upsert(docs.map((document, i) => {
      const embedding = embeddings[i];
      if (!embedding) throw new Error(`missing embedding ${i}`);
      return { document, embedding };
    }));
    const qs = await provider.embed(['acid peak techno driving']);
    const q = qs[0];
    if (!q) throw new Error('missing query embedding');
    const res = await idx.search(q, 2);
    assert.equal(await idx.size(), 4);
    assert.ok(res.length >= 1);
    assert.equal(res[0]!.document.trackId, 't-1', 'Query acid techno debe rankear t1 primero');
    assert.ok(res[0]!.similarity > 0.5, `Sim top debe ser >0.5 got ${res[0]!.similarity}`);
  });

  it('F55.3 defaults config semantic retrieval v1 weight 15%', () => {
    assert.equal(SEMANTIC_RETRIEVAL_V1_DEFAULTS.weightInTotalScore, 0.15);
    assert.equal(SEMANTIC_RETRIEVAL_V1_DEFAULTS.offlineMode, true);
  });
});
