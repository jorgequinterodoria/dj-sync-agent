import assert from 'node:assert/strict';
import test from 'node:test';

import { createDJSyncRecommendationService } from './dj-sync-recommendation-service.js';

test('recommendation service is disabled without configuration', () => {
  const service = createDJSyncRecommendationService({ configured: false });
  assert.equal(service.snapshot().status, 'disabled');
});

test('recommendation service delegates recommendation and persists it', async () => {
  let saved = 0;
  const service = createDJSyncRecommendationService({
    configured: true,
    repository: {
      async saveRecommendation() { saved += 1; return 1; },
      async saveSetIntelligence() { return 1; },
    },
  });
  const result = await service.recommend({
    deviceId: 'd1', currentTrack: { trackId: 'current', bpm: 124 }, request: 'next',
    candidates: [{ trackId: 'next', bpm: 125 }],
  });
  assert.equal(result.recommendations[0]?.trackId, 'next');
  assert.equal(saved, 1);
  assert.equal(service.snapshot().lastRecommendationId, result.recommendationId);
});

test('recommendation service persists set analysis', async () => {
  let saved = 0;
  const service = createDJSyncRecommendationService({
    configured: true,
    repository: {
      async saveRecommendation() { return 1; },
      async saveSetIntelligence() { saved += 1; return 2; },
    },
  });
  const result = await service.analyzeSet({ deviceId: 'd1', request: 'set', tracks: [{ trackId: '1', bpm: 124 }] });
  assert.equal(saved, 1);
  assert.equal(service.snapshot().lastSetId, result.setId);
});
