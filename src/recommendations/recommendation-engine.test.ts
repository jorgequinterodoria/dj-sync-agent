import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecommendationEngine } from './recommendation-engine.js';

function current() {
  return {
    trackId: 'current', title: 'Current', artist: 'Artist A', genre: 'House', key: '8A', bpm: 124, energy: 0.7, rating: 5, playCount: 100,
  };
}

test('recommendation engine ranks compatible candidates deterministically', () => {
  const engine = createRecommendationEngine({ now: () => '2026-08-27T00:00:00.000Z', id: () => 'recommendation-1' });
  const result = engine.recommend({
    deviceId: 'device-1', currentTrack: current(), request: 'Find the best next track',
    candidates: [
      { trackId: 'b', artist: 'Artist B', genre: 'House', key: '8B', bpm: 125, energy: 0.72, rating: 5, playCount: 20, semanticSimilarity: 0.9 },
      { trackId: 'a', artist: 'Artist C', genre: 'House', key: '1A', bpm: 140, energy: 0.3, rating: 2, playCount: 1, semanticSimilarity: 0.2 },
    ],
  });
  assert.equal(result.recommendations[0]?.trackId, 'b');
  assert.equal(result.recommendationId, 'recommendation-1');
  assert.equal(result.generatedBy, 'deterministic');
});

test('recommendation engine enforces hard bpm constraints', () => {
  const engine = createRecommendationEngine();
  const result = engine.recommend({
    deviceId: 'device-1', currentTrack: current(), request: 'Keep the tempo tight',
    constraints: { maxBpmDelta: 4 },
    candidates: [
      { trackId: 'ok', artist: 'B', bpm: 127 },
      { trackId: 'bad', artist: 'C', bpm: 135 },
    ],
  });
  assert.deepEqual(result.recommendations.map((r) => r.trackId), ['ok']);
});

test('recommendation engine excludes recent artists', () => {
  const engine = createRecommendationEngine();
  const result = engine.recommend({
    deviceId: 'device-1', currentTrack: current(), request: 'Avoid repeats', recentArtistNames: ['Artist B'],
    candidates: [
      { trackId: 'repeat', artist: 'Artist B', bpm: 124 },
      { trackId: 'fresh', artist: 'Artist C', bpm: 124 },
    ],
  });
  assert.deepEqual(result.recommendations.map((r) => r.trackId), ['fresh']);
});

test('recommendation engine clamps recommendation limit', () => {
  const engine = createRecommendationEngine();
  const candidates = Array.from({ length: 60 }, (_, i) => ({ trackId: `t-${i}`, bpm: 124 }));
  const result = engine.recommend({ deviceId: 'device-1', currentTrack: current(), request: 'Many options', candidates, limit: 999 });
  assert.equal(result.recommendations.length, 50);
});

test('recommendation engine rejects empty device id', () => {
  const engine = createRecommendationEngine();
  assert.throws(() => engine.recommend({ deviceId: ' ', currentTrack: current(), request: 'x', candidates: [] }), /device id/);
});

test('set intelligence detects repetition and range warnings', () => {
  const engine = createRecommendationEngine({ id: () => 'set-1' });
  const result = engine.analyzeSet({
    deviceId: 'device-1', request: 'Analyze set', durationMinutes: 60,
    tracks: [
      { trackId: '1', artist: 'A', genre: 'House', bpm: 110, energy: 0.4 },
      { trackId: '2', artist: 'A', genre: 'House', bpm: 135, energy: 0.8 },
      { trackId: '3', artist: 'B', genre: 'Techno', bpm: 130, energy: 0.9 },
    ],
  });
  assert.equal(result.setId, 'set-1');
  assert.equal(result.artistCount, 2);
  assert.equal(result.repeatedArtistCount, 1);
  assert.equal(result.bpmRange.min, 110);
  assert.equal(result.bpmRange.max, 135);
  assert.ok(result.warnings.length >= 2);
});


test('F67 recommendation ranking applies deterministic personalization overlay', () => {
  const engine = createRecommendationEngine({ id: () => 'rec-67', now: () => '2026-08-31T00:00:00Z' });
  const result = engine.recommend({
    deviceId: 'd1', request: 'next', currentTrack: { trackId: 'current', bpm: 126, genre: 'house', energy: 0.75 },
    candidates: [
      { trackId: 'generic', bpm: 126, genre: 'techno', energy: 0.75, artist: 'other' },
      { trackId: 'preferred', bpm: 126, genre: 'house', energy: 0.78, artist: 'artist a', key: '8A' },
    ],
    personalizationProfile: {
      schemaVersion: 1, engineVersion: '1.0.0', computedAt: '2026-08-31T00:00:00Z', deviceId: 'd1',
      profile: { preferredGenres: ['house'], avoidedGenres: ['techno'], preferredBpmMin: 124, preferredBpmMax: 128, preferredEnergyMin: 0.7, preferredEnergyMax: 0.85, preferredKeys: ['8a'], preferredArtists: ['artist a'], avoidedArtists: [] },
      confidence: { genre: 90, bpm: 90, energy: 90, key: 80, artist: 90 }, evidence: { totalEvents: 10, positiveEvents: 8, negativeEvents: 2 },
    },
  });
  assert.equal(result.recommendations[0]?.trackId, 'preferred');
});
