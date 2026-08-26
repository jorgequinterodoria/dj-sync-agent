import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AudioAnalysisService,
  type AudioAnalysisServiceOptions,
} from './audio-analysis-service.js';
import type { AudioAnalysis } from './audio-analysis.js';
import type { AudioAnalysisPersistencePort } from './audio-analysis-persistence.js';
import type { VerifiedAudioAsset } from './audio-verifier.js';

const analysis: AudioAnalysis = {
  durationSeconds: 210.837188,
  sampleRate: 44100,
  channels: 2,
  bitrate: 128000,
  codec: 'mp3',
};

const asset: VerifiedAudioAsset = {
  path: '/music/test.mp3',
  size: 3537836,
  checksum:
    '6e32629e41e3a6e84e71b0d61905a75dc0bf76c8d4b93d53c1b240efc08d1322',
  algorithm: 'sha256',
  bytesRead: 3537836,
};

function createPersistenceMock(): AudioAnalysisPersistencePort & {
  calls: Array<{
    trackId: string;
    analysis: AudioAnalysis;
    asset: VerifiedAudioAsset;
  }>;
} {
  const calls: Array<{
    trackId: string;
    analysis: AudioAnalysis;
    asset: VerifiedAudioAsset;
  }> = [];

  return {
    calls,

    async persist(
      trackId: string,
      receivedAnalysis: AudioAnalysis,
      receivedAsset: VerifiedAudioAsset,
    ) {
      calls.push({
        trackId,
        analysis: receivedAnalysis,
        asset: receivedAsset,
      });

      return {
        analysisRunId: 33,
        persistedFeatures: 5,
      };
    },
  };
}

function createService(
  overrides: Partial<AudioAnalysisServiceOptions> = {},
): AudioAnalysisService {
  return new AudioAnalysisService({
    analyzer: async () => analysis,
    ...overrides,
  });
}

test('analyze trims the file path before calling the analyzer', async () => {
  const calls: string[] = [];

  const service = createService({
    analyzer: async (filePath) => {
      calls.push(filePath);
      return analysis;
    },
  });

  const result = await service.analyze(
    '  /music/test.mp3  ',
  );

  assert.deepEqual(result, analysis);
  assert.deepEqual(calls, ['/music/test.mp3']);
});

test('analyze rejects an empty file path', async () => {
  let analyzerCalled = false;

  const service = createService({
    analyzer: async () => {
      analyzerCalled = true;
      return analysis;
    },
  });

  await assert.rejects(
    () => service.analyze('   '),
    {
      message: 'Audio file path is required.',
    },
  );

  assert.equal(analyzerCalled, false);
});

test('analyzeAndPersist rejects an empty track id', async () => {
  let verifierCalled = false;

  const service = createService({
    verifier: async () => {
      verifierCalled = true;
      return asset;
    },
    persistence: createPersistenceMock(),
  });

  await assert.rejects(
    () =>
      service.analyzeAndPersist(
        '   ',
        '/music/test.mp3',
      ),
    {
      message: 'Track ID is required.',
    },
  );

  assert.equal(verifierCalled, false);
});

test('analyzeAndPersist requires persistence', async () => {
  const service = createService({
    verifier: async () => asset,
  });

  await assert.rejects(
    () =>
      service.analyzeAndPersist(
        '65456953',
        '/music/test.mp3',
      ),
    {
      message:
        'Audio analysis persistence is not configured.',
    },
  );
});

test('analyzeAndPersist requires asset verification', async () => {
  const service = createService({
    persistence: createPersistenceMock(),
  });

  await assert.rejects(
    () =>
      service.analyzeAndPersist(
        '65456953',
        '/music/test.mp3',
      ),
    {
      message:
        'Audio analysis asset verification is not configured.',
    },
  );
});

test('analyzeAndPersist rejects an empty file path', async () => {
  let verifierCalled = false;

  const service = createService({
    verifier: async () => {
      verifierCalled = true;
      return asset;
    },
    persistence: createPersistenceMock(),
  });

  await assert.rejects(
    () =>
      service.analyzeAndPersist(
        '65456953',
        '   ',
      ),
    {
      message: 'Audio file path is required.',
    },
  );

  assert.equal(verifierCalled, false);
});

test('analyzeAndPersist verifies, analyzes and persists in order', async () => {
  const calls: string[] = [];
  const persistence = createPersistenceMock();

  const service = createService({
    verifier: async (filePath) => {
      calls.push(`verify:${filePath}`);
      return asset;
    },

    analyzer: async (filePath) => {
      calls.push(`analyze:${filePath}`);
      return analysis;
    },

    persistence,
  });

  const result = await service.analyzeAndPersist(
    ' 65456953 ',
    ' /music/test.mp3 ',
  );

  assert.deepEqual(calls, [
    'verify:/music/test.mp3',
    'analyze:/music/test.mp3',
  ]);

  assert.deepEqual(result, {
    analysis,
    persistence: {
      analysisRunId: 33,
      persistedFeatures: 5,
    },
  });

  assert.equal(persistence.calls.length, 1);
  assert.deepEqual(persistence.calls[0], {
    trackId: '65456953',
    analysis,
    asset,
  });
});

test('analyzeAndPersist does not persist when verification fails', async () => {
  let analyzerCalled = false;
  const persistence = createPersistenceMock();

  const service = createService({
    verifier: async () => {
      throw new Error('verification failed');
    },

    analyzer: async () => {
      analyzerCalled = true;
      return analysis;
    },

    persistence,
  });

  await assert.rejects(
    () =>
      service.analyzeAndPersist(
        '65456953',
        '/music/test.mp3',
      ),
    {
      message: 'verification failed',
    },
  );

  assert.equal(analyzerCalled, false);
  assert.equal(persistence.calls.length, 0);
});

test('analyzeAndPersist does not persist when analysis fails', async () => {
  const persistence = createPersistenceMock();

  const service = createService({
    verifier: async () => asset,

    analyzer: async () => {
      throw new Error('analysis failed');
    },

    persistence,
  });

  await assert.rejects(
    () =>
      service.analyzeAndPersist(
        '65456953',
        '/music/test.mp3',
      ),
    {
      message: 'analysis failed',
    },
  );

  assert.equal(persistence.calls.length, 0);
});

test('analyzeAndPersist passes the verified asset unchanged to persistence', async () => {
  const persistence = createPersistenceMock();

  const service = createService({
    verifier: async () => asset,
    persistence,
  });

  await service.analyzeAndPersist(
    '65456953',
    '/music/test.mp3',
  );

  assert.equal(persistence.calls[0]?.asset, asset);
});

test('analyzeAndPersist passes the analyzer result unchanged to persistence', async () => {
  const persistence = createPersistenceMock();

  const service = createService({
    analyzer: async () => analysis,
    verifier: async () => asset,
    persistence,
  });

  await service.analyzeAndPersist(
    '65456953',
    '/music/test.mp3',
  );

  assert.equal(
    persistence.calls[0]?.analysis,
    analysis,
  );
});