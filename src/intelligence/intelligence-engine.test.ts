import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTELLIGENCE_ENGINE_VERSION,
  buildTrackIntelligenceProfile,
  buildTrackIntelligenceProfileFromJobPayload,
} from './intelligence-engine.js';

function createTrack() {
  return {
    schemaVersion: 1 as const,
    identity: {
      id: '65456953',
      uuid: 'uuid-1',
    },
    metadata: {
      title: 'Abba - Dancing Queen',
      artist: 'ENNEM Produciendo',
      album: null,
      genre: 'House',
      label: null,
      key: 'C',
      remixer: null,
      composer: null,
      isrc: null,
    },
    technical: {
      bpmRaw: 12500,
      bpm: 125,
      lengthSeconds: 210,
      bitrate: 128000,
      bitDepth: null,
      sampleRate: 44100,
      rating: 5,
      playCount: 12,
      fileType: 1,
      analyzed: 1,
    },
    primaryFile: {
      id: 'file-1',
      path: '/music/test.mp3',
      localPath: '/music/test.mp3',
      hash: null,
      size: 3537836,
      kind: 'media' as const,
    },
    files: [],
    cues: [],
    playlists: [],
    sync: {
      rbLocalDeleted: 0,
      rbLocalUsn: 1502067,
      updatedAt: '2026-08-27T00:00:00.000Z',
    },
  };
}

function createAnalysis() {
  return {
    analysisRunId: 37,
    deviceId: 'macbook-air-jorge-1',
    trackId: '65456953',
    sourceEventId: null,
    sourceRbLocalUsn: 1502067,
    trackHash: '984c845f',
    analysisVersion: 1,
    pipelineVersion: '3.2',
    executionContext: 'desktop',
    status: 'completed',
    startedAt: '2026-08-26T20:04:12.000Z',
    completedAt: '2026-08-26T20:04:20.000Z',
    lastError: null,
    createdAt: '2026-08-26T20:04:12.000Z',
    updatedAt: '2026-08-26T20:04:20.000Z',
  };
}

test('intelligence engine produces a deterministic versioned profile', () => {
  const profile = buildTrackIntelligenceProfile({
    track: createTrack(),
    latestAnalysis: createAnalysis(),
    latestFeatures: [
      {
        deviceId: 'macbook-air-jorge-1',
        trackId: '65456953',
        analysisRunId: 37,
        featureGroup: 'audio',
        featureKey: 'codec',
        numericValue: null,
        textValue: 'mp3',
        booleanValue: null,
        jsonValue: null,
        unit: null,
        source: 'audio',
        confidence: 1,
        createdAt: '2026-08-26T20:04:17.000Z',
      },
      {
        deviceId: 'macbook-air-jorge-1',
        trackId: '65456953',
        analysisRunId: 37,
        featureGroup: 'audio',
        featureKey: 'channels',
        numericValue: 2,
        textValue: null,
        booleanValue: null,
        jsonValue: null,
        unit: 'count',
        source: 'audio',
        confidence: 1,
        createdAt: '2026-08-26T20:04:17.000Z',
      },
    ],
    now: '2026-08-27T10:00:00.000Z',
  });

  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.engineVersion, INTELLIGENCE_ENGINE_VERSION);
  assert.equal(profile.analysis.available, true);
  assert.equal(profile.analysis.analysisRunId, 37);
  assert.equal(profile.dj.tempoBand, 'fast');
  assert.equal(profile.dj.durationBand, 'standard');
  assert.equal(profile.dj.keyPresent, true);
  assert.equal(profile.dj.genrePresent, true);
  assert.equal(profile.audio.channels, 2);
  assert.equal(profile.audio.codec, 'mp3');
  assert.equal(profile.audio.qualityTier, 'lossy_standard');
  assert.ok(profile.dj.readinessScore > 70);
  assert.ok(profile.dj.engagementScore > 50);
});

test('intelligence engine does not invent unavailable musical signals', () => {
  const profile = buildTrackIntelligenceProfile({
    track: createTrack(),
    latestAnalysis: {
      ...createAnalysis(),
      status: 'completed',
    },
    latestFeatures: [],
    now: '2026-08-27T10:00:00.000Z',
  });

  assert.equal(profile.signals.energy, null);
  assert.equal(profile.signals.danceability, null);
  assert.equal(profile.signals.valence, null);
  assert.equal(profile.signals.loudnessLufs, null);
  assert.equal(profile.signals.spectralCentroidHz, null);
  assert.equal(profile.signals.instrumentalness, null);
  assert.equal(profile.signals.speechiness, null);
  assert.equal(profile.signals.acousticness, null);
});

test('intelligence engine reads job payload snapshots without requiring n8n', () => {
  const profile = buildTrackIntelligenceProfileFromJobPayload(
    {
      trackId: '65456953',
      trackUuid: 'uuid-1',
      deviceId: 'macbook-air-jorge-1',
      trackHash: '984c845f',
      currentState: {
        title: 'Abba - Dancing Queen',
        artist: 'ENNEM Produciendo',
        album: null,
        genre: 'House',
        key: 'C',
        bpm: 125,
        lengthSeconds: 210,
        bitrate: 128,
        sampleRate: 44100,
        rating: 5,
        playCount: 12,
        remixer: null,
      },
      analysisContext: {
        analysisRunId: 37,
        analysisVersion: 1,
        pipelineVersion: '3.2',
        status: 'completed',
        completedAt: '2026-08-26T20:04:20.000Z',
      },
      featureSnapshot: [],
    },
    1502067,
  );

  assert.equal(profile.provenance.trackHash, '984c845f');
  assert.equal(profile.provenance.rbLocalUsn, 1502067);
});

test('intelligence engine rejects malformed job payloads', () => {
  assert.throws(
    () =>
      buildTrackIntelligenceProfileFromJobPayload(
        {},
        null,
      ),
    /currentState is required/,
  );
});
