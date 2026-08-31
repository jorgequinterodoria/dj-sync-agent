import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AIEmbeddingProvider,
} from '../ai/embedding-provider.js';
import type {
  TrackIntelligenceProfile,
} from '../intelligence/intelligence-engine.js';
import {
  createDJSyncSemanticMemoryService,
} from './dj-sync-semantic-memory.js';

function provider(): AIEmbeddingProvider {
  return {
    id: 'test',
    dimensions: 3,
    async embed() {
      return {
        model: 'test-model',
        embeddings: [[0.1, 0.2, 0.3]],
        usage: {
          inputTokens: 1,
          totalTokens: 1,
        },
      };
    },
  };
}

const profile = {
  schemaVersion: 1,
  engineVersion: '1.0.0',
  computedAt: '2026-08-27T00:00:00.000Z',
  metadata: {
    completenessScore: 80,
    presentFields: 8,
    totalFields: 10,
  },
  technical: {
    completenessScore: 90,
    availableFields: 7,
    totalFields: 8,
  },
  analysis: {
    available: true,
    status: 'completed',
    analysisRunId: 37,
    analysisVersion: 1,
    pipelineVersion: '3.2',
    featureCount: 5,
  },
  dj: {
    readinessScore: 90,
    engagementScore: 80,
    tempoBand: 'fast',
    durationBand: 'standard',
    keyPresent: true,
    genrePresent: true,
    artistPresent: true,
    fingerprintReady: true,
  },
  audio: {
    qualityTier: 'lossy_standard',
    bitrateKbps: 128,
    sampleRateHz: 44100,
    channels: 2,
    codec: 'mp3',
  },
  signals: {
    energy: null,
    danceability: null,
    valence: null,
    loudnessLufs: null,
    spectralCentroidHz: null,
    instrumentalness: null,
    speechiness: null,
    acousticness: null,
  },
  provenance: {
    trackHash: 'hash',
    rbLocalUsn: 100,
    analysisRunId: 37,
    analysisVersion: 1,
    pipelineVersion: '3.2',
  },
} as TrackIntelligenceProfile;

test('semantic memory reports disabled without repository configuration', () => {
  const service = createDJSyncSemanticMemoryService({
    provider: provider(),
    repositoryUrl: null,
    apiKey: null,
    deviceId: 'device-1',
  });

  assert.equal(service.snapshot().configured, false);
  assert.equal(service.snapshot().status, 'disabled');
});

test('semantic memory exposes provider dimensions', () => {
  const service = createDJSyncSemanticMemoryService({
    provider: provider(),
    repositoryUrl: 'https://example.com',
    apiKey: 'key',
    deviceId: 'device-1',
  });

  assert.equal(service.snapshot().configured, true);
  assert.equal(service.snapshot().dimensions, 3);
  assert.equal(service.snapshot().provider, 'test');
});
