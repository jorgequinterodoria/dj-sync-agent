import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  TrackIntelligenceProfile,
} from './intelligence-engine.js';
import {
  buildTrackSemanticDocument,
} from './semantic-document.js';

function profile(): TrackIntelligenceProfile {
  return {
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
      readinessScore: 94,
      engagementScore: 79,
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
      trackHash: 'abc123',
      rbLocalUsn: 1502067,
      analysisRunId: 37,
      analysisVersion: 1,
      pipelineVersion: '3.2',
    },
  };
}

test('semantic document is deterministic', () => {
  const a = buildTrackSemanticDocument(profile(), {
    trackId: '65456953',
  });
  const b = buildTrackSemanticDocument(profile(), {
    trackId: '65456953',
  });

  assert.equal(a.content, b.content);
  assert.equal(a.contentHash, b.contentHash);
});

test('semantic document carries provenance', () => {
  const document = buildTrackSemanticDocument(profile(), {
    trackId: '65456953',
  });

  assert.equal(document.trackId, '65456953');
  assert.equal(document.trackHash, 'abc123');
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.documentType, 'dj.track');
  assert.match(document.contentHash, /^[a-f0-9]{64}$/);
});
