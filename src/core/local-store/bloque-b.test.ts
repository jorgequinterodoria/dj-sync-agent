import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VerifiedAudioAsset } from '../../audio/audio-verifier.js';
import type { AudioAnalysis } from '../../audio/audio-analysis.js';
import type { TrackIntelligenceProfile, IntelligenceSignals, TempoBand, DurationBand, AudioQualityTier } from '../../intelligence/intelligence-engine.js';
import type { AudioFeaturesV1 } from './ports.js';
import { InMemoryCopilotDbStore } from './in-memory-store.js';

function asset(overrides: Partial<VerifiedAudioAsset> = {}): VerifiedAudioAsset {
  return {
    path: '/tmp/song.mp3',
    localPath: overrides.path ?? '/tmp/song.mp3',
    size: 100_000,
    checksum: `sha256:${crypto.randomUUID()}`,
    algorithm: 'sha256',
    bytesRead: 100_000,
    ...overrides,
  } as VerifiedAudioAsset & { localPath: string };
}

function analysis(overrides: Partial<AudioAnalysis> = {}): AudioAnalysis {
  return {
    durationSeconds: 300,
    sampleRate: 44100,
    channels: 2,
    bitrate: 320,
    codec: 'mp3',
    ...overrides,
  };
}

void describe('PHASE40+PHASE41+PHASE42 — Audio store, Profiles, Sync runs', () => {
  void it('AudioAnalysis persist + getLatest round trip (implements AudioAnalysisPersistencePort)', async () => {
    const store = new InMemoryCopilotDbStore();
    const a = analysis();
    const v = asset({ checksum: 'sha256:aaa' });
    const result = await store.persistAnalysis('tr-1', a, v);
    assert.ok(result.analysisRunId >= 1);
    assert.equal(result.persistedFeatures, 5);

    const latest = await store.getLatestAnalysis('tr-1');
    assert.ok(latest);
    assert.equal(latest!.analysisRunId, result.analysisRunId);
    assert.equal(latest!.assetChecksum, 'sha256:aaa');
    assert.equal(latest!.analysis.codec, 'mp3');
    assert.equal(latest!.analysis.durationSeconds, 300);
    assert.equal(await store.getLatestAnalysis('missing'), null);
    await store.close();
  });

  void it('AudioFeaturesV1 persist/get (Bloque D boundary contract)', async () => {
    const store = new InMemoryCopilotDbStore();
    const features: AudioFeaturesV1 = {
      schemaVersion: 1,
      generatedAt: new Date('2026-08-28').toISOString(),
      analyzerVersion: 'heuristic-v0.1',
      trackId: 'tr-2',
      energy: 0.8,
      danceability: 0.7,
      danceFloorIntensity: 0.78,
      rhythmicDensity: 0.55,
      moodTags: ['driving', 'dark', 'peak'],
      vocalPresence: 0.1,
      instrumentalProbability: 0.9,
      musicalSections: null,
      phraseBoundariesMs: null,
      qualityFlags: [],
    };
    await store.persistFeatures('tr-2', features);
    const got = await store.getFeatures('tr-2');
    assert.deepEqual(got, features);
    assert.equal(await store.getFeatures('missing'), null);
    await store.close();
  });

  void it('DJTrackProfiles persist/get por (track+versiones) — determinismo key', async () => {
    const store = new InMemoryCopilotDbStore();
    const now = new Date('2026-08-28T00:00:00.000Z').toISOString();
    const signals: IntelligenceSignals = {
      energy: 0.8, danceability: 0.7, valence: 0.5, loudnessLufs: -10,
      spectralCentroidHz: 2000, instrumentalness: 0.7, speechiness: 0.1, acousticness: 0.05,
    };
    const profile: TrackIntelligenceProfile = {
      schemaVersion: 1,
      engineVersion: '1.0.0',
      computedAt: now,
      metadata: { completenessScore: 0.9, presentFields: 45, totalFields: 50 },
      technical: { completenessScore: 0.85, availableFields: 17, totalFields: 20 },
      analysis: { available: true, status: 'ok', analysisRunId: 1, analysisVersion: 1, pipelineVersion: '1.0.0', featureCount: 8 },
      dj: {
        readinessScore: 0.95, engagementScore: 0.8, tempoBand: 'fast' as TempoBand,
        durationBand: 'standard' as DurationBand, keyPresent: true, genrePresent: true,
        artistPresent: true, fingerprintReady: true,
      },
      audio: { qualityTier: 'lossy_high' as AudioQualityTier, bitrateKbps: 320, sampleRateHz: 44100, channels: 2, codec: 'mp3' },
      signals,
      provenance: { trackHash: 'aaaa', rbLocalUsn: 100, analysisRunId: 1, analysisVersion: 1, pipelineVersion: '1.0.0' },
    };
    const keyArgs = {
      trackId: 'tr-3',
      engineVersion: '1.0.0',
      profileVersion: 1,
      schemaVersion: 1,
      audioFeaturesVersion: 1,
      featuresVersion: 1,
    };
    await store.persistIntelligenceProfile({ ...keyArgs, profile });
    const read = await store.getIntelligenceProfile(keyArgs);
    assert.deepEqual(read, profile);

    const missingVersion = await store.getIntelligenceProfile({ ...keyArgs, profileVersion: 99 });
    assert.equal(missingVersion, null);
    await store.close();
  });

  void it('sync_runs lifecycle: start/finish, lastSuccessfulRun, idempotency-friendly', async () => {
    const store = new InMemoryCopilotDbStore();
    const started = new Date('2026-08-28T00:00:00Z').toISOString();
    const id = await store.startRun(started);
    const got = await store.getRun(id);
    assert.ok(got);
    assert.equal(got!.status, 'running');
    assert.equal(got!.started_at, started);

    await store.finishRun({
      syncRunId: id,
      status: 'success',
      rowsAdded: 10,
      rowsUpdated: 2,
      rowsDeleted: 1,
    });
    const success = await store.getRun(id);
    assert.equal(success!.status, 'success');
    assert.equal(success!.rows_added, 10);
    assert.equal(success!.rows_updated, 2);
    assert.equal(success!.rows_deleted, 1);

    const last = await store.getLastSuccessfulRun();
    assert.equal(last!.sync_run_id, id);

    const errorStarted = await store.startRun();
    await store.finishRun({
      syncRunId: errorStarted,
      status: 'error',
      rowsAdded: 0,
      rowsUpdated: 0,
      rowsDeleted: 0,
      errorMessage: 'timeout',
    });
    const err = await store.getRun(errorStarted);
    assert.equal(err!.status, 'error');
    assert.equal(err!.error_message, 'timeout');

    assert.equal((await store.getLastSuccessfulRun())!.sync_run_id, id, 'last successful no cambia por run error');
    await store.close();
  });
});
