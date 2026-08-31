import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AudioAnalysisService,
} from '../audio/audio-analysis-service.js';

import type {
  AudioAnalysis,
} from '../audio/audio-analysis.js';

import type {
  VerifiedAudioAsset,
} from '../audio/audio-verifier.js';

import type {
  AudioAnalysisRunPersistencePort,
} from '../audio/audio-analysis-run-persistence.js';

import {
  createDJSyncAudioApplicationService,
} from './dj-sync-audio-service.js';

import type {
  NormalizedTrack,
} from '../rekordbox/normalized-track.js';

const analysis:
  AudioAnalysis = {
  durationSeconds:
    210.837188,

  sampleRate:
    44100,

  channels:
    2,

  bitrate:
    128000,

  codec:
    'mp3',
};

const asset:
  VerifiedAudioAsset = {
  path:
    '/music/test.mp3',

  size:
    3537836,

  checksum:
    '6e32629e41e3a6e84e71b0d61905a75dc0bf76c8d4b93d53c1b240efc08d1322',

  algorithm:
    'sha256',

  bytesRead:
    3537836,
};

function createTrack():
  NormalizedTrack {
  return {
    schemaVersion:
      1,

    identity: {
      id:
        '65456953',

      uuid:
        'uuid-1',
    },

    metadata: {
      title:
        'Test Track',

      artist:
        'Test Artist',

      album:
        'Test Album',

      genre:
        null,

      label:
        null,

      key:
        'Am',

      remixer:
        null,

      composer:
        null,

      isrc:
        null,
    },

    technical: {
      bpmRaw:
        12500,

      bpm:
        125,

      lengthSeconds:
        210,

      bitrate:
        128000,

      bitDepth:
        null,

      sampleRate:
        44100,

      rating:
        5,

      playCount:
        10,

      fileType:
        1,

      analyzed:
        1,
    },

    primaryFile: {
      id:
        'file-1',

      path:
        '/music/test.mp3',

      localPath:
        '/music/test.mp3',

      hash:
        null,

      size:
        3537836,

      kind:
        'media',
    },

    files: [],

    cues: [],

    playlists: [],

    sync: {
      rbLocalDeleted:
        0,

      rbLocalUsn:
        123,

      updatedAt:
        '2026-01-01T00:00:00.000Z',
    },
  };
}

function createLibrary() {
  const track =
    createTrack();

  return {
    getById:
      async (
        _trackId: string,
      ) =>
        track,
  };
}

function createAnalysisService(
  overrides: {
    analyzer?:
      (
        filePath: string,
      ) =>
        Promise<AudioAnalysis>;

    verifier?:
      (
        filePath: string,
      ) =>
        Promise<VerifiedAudioAsset>;
  } = {},
):
  AudioAnalysisService {
  return new AudioAnalysisService({
    analyzer:
      overrides.analyzer ??
      (async () =>
        analysis),

    verifier:
      overrides.verifier ??
      (async () =>
        asset),
  });
}

function createRunPersistenceMock():
  AudioAnalysisRunPersistencePort & {
    calls: Array<{
      trackId: string;
      analysis: AudioAnalysis;
      asset: VerifiedAudioAsset;
    }>;
  } {
  const calls:
    Array<{
      trackId: string;
      analysis: AudioAnalysis;
      asset: VerifiedAudioAsset;
    }> = [];

  return {
    calls,

    async persistVerifiedAnalysis(
      trackId,
      receivedAnalysis,
      receivedAsset,
    ) {
      calls.push({
        trackId,

        analysis:
          receivedAnalysis,

        asset:
          receivedAsset,
      });

      return {
        analysisRunId:
          44,

        persistedFeatures:
          5,
      };
    },
  };
}

function createService(
  options: {
    analysisService?:
      AudioAnalysisService;

    verifier?:
      (
        filePath: string,
      ) =>
        Promise<VerifiedAudioAsset>;

    runPersistence?:
      AudioAnalysisRunPersistencePort;

    persistenceConfigured?:
      boolean;
  } = {},
) {
  return createDJSyncAudioApplicationService(
    {
      library:
        createLibrary(),

      analysisService:
        options.analysisService ??
        createAnalysisService(),

      verifier:
        options.verifier ??
        (async () =>
          asset),

      runPersistence:
        options.runPersistence ??
        createRunPersistenceMock(),

      persistenceConfigured:
        options.persistenceConfigured ??
        true,
    },
  );
}

test(
  'audio application service returns idle status for a track',
  async () => {
    const service =
      createService();

    const result =
      await service.status(
        '65456953',
      );

    assert.equal(
      result.status,
      'idle',
    );

    assert.equal(
      result.trackId,
      '65456953',
    );

    assert.equal(
      result.filePath,
      '/music/test.mp3',
    );

    assert.equal(
      result.verified,
      false,
    );

    assert.equal(
      result.analysis,
      null,
    );

    assert.equal(
      result.persistence,
      null,
    );

    assert.equal(
      result.error,
      null,
    );
  },
);

test(
  'audio application service verifies and analyzes',
  async () => {
    const calls:
      string[] = [];

    const service =
      createService({
        verifier:
          async (
            filePath,
          ) => {
            calls.push(
              `verify:${filePath}`,
            );

            return asset;
          },

        analysisService:
          createAnalysisService({
            analyzer:
              async (
                filePath,
              ) => {
                calls.push(
                  `analyze:${filePath}`,
                );

                return analysis;
              },
          }),
      });

    const result =
      await service.analyze(
        '65456953',
      );

    assert.deepEqual(
      calls,
      [
        'verify:/music/test.mp3',
        'analyze:/music/test.mp3',
      ],
    );

    assert.equal(
      result.status,
      'completed',
    );

    assert.equal(
      result.verified,
      true,
    );

    assert.deepEqual(
      result.asset,
      asset,
    );

    assert.deepEqual(
      result.analysis,
      analysis,
    );

    assert.equal(
      result.persistence,
      null,
    );

    assert.equal(
      result.error,
      null,
    );
  },
);

test(
  'audio application service persists the verified analysis through the run persistence port',
  async () => {
    const calls:
      string[] = [];

    const persistence =
      createRunPersistenceMock();

    const runPersistence:
      AudioAnalysisRunPersistencePort =
      {
        async persistVerifiedAnalysis(
          trackId,
          receivedAnalysis,
          receivedAsset,
        ) {
          calls.push(
            `persist:${trackId}`,
          );

          assert.deepEqual(
            receivedAnalysis,
            analysis,
          );

          assert.deepEqual(
            receivedAsset,
            asset,
          );

          const result =
            await persistence.persistVerifiedAnalysis(
              trackId,
              receivedAnalysis,
              receivedAsset,
            );

          return result;
        },
      };

    const service =
      createService({
        verifier:
          async (
            filePath,
          ) => {
            calls.push(
              `verify:${filePath}`,
            );

            return asset;
          },

        analysisService:
          createAnalysisService({
            analyzer:
              async (
                filePath,
              ) => {
                calls.push(
                  `analyze:${filePath}`,
                );

                return analysis;
              },
          }),

        runPersistence,

        persistenceConfigured:
          true,
      });

    const result =
      await service
        .analyzeAndPersist(
          '65456953',
        );

    assert.deepEqual(
      calls,
      [
        'verify:/music/test.mp3',
        'analyze:/music/test.mp3',
        'persist:65456953',
      ],
    );

    assert.equal(
      result.status,
      'completed',
    );

    assert.equal(
      result.verified,
      true,
    );

    assert.deepEqual(
      result.asset,
      asset,
    );

    assert.deepEqual(
      result.analysis,
      analysis,
    );

    assert.deepEqual(
      result.persistence,
      {
        analysisRunId:
          44,

        persistedFeatures:
          5,
      },
    );

    assert.equal(
      result.error,
      null,
    );

    assert.equal(
      persistence.calls.length,
      1,
    );

    assert.deepEqual(
      persistence.calls[0],
      {
        trackId:
          '65456953',

        analysis,

        asset,
      },
    );
  },
);

test(
  'audio application service does not persist when verification fails',
  async () => {
    const persistence =
      createRunPersistenceMock();

    const service =
      createService({
        verifier:
          async () => {
            throw new Error(
              'verification failed',
            );
          },

        runPersistence:
          persistence,
      });

    const result =
      await service
        .analyzeAndPersist(
          '65456953',
        );

    assert.equal(
      result.status,
      'failed',
    );

    assert.equal(
      result.error,
      'verification failed',
    );

    assert.equal(
      persistence.calls.length,
      0,
    );
  },
);

test(
  'audio application service does not persist when analysis fails',
  async () => {
    const persistence =
      createRunPersistenceMock();

    const service =
      createService({
        analysisService:
          createAnalysisService({
            analyzer:
              async () => {
                throw new Error(
                  'analysis failed',
                );
              },
          }),

        runPersistence:
          persistence,
      });

    const result =
      await service
        .analyzeAndPersist(
          '65456953',
        );

    assert.equal(
      result.status,
      'failed',
    );

    assert.equal(
      result.error,
      'analysis failed',
    );

    assert.equal(
      persistence.calls.length,
      0,
    );
  },
);

test(
  'audio application service rejects an empty track id',
  async () => {
    const service =
      createService();

    await assert.rejects(
      () =>
        service.status(
          '   ',
        ),
      {
        message:
          'Track ID is required.',
      },
    );

    await assert.rejects(
      () =>
        service.analyze(
          '   ',
        ),
      {
        message:
          'Track ID is required.',
      },
    );

    await assert.rejects(
      () =>
        service.analyzeAndPersist(
          '   ',
        ),
      {
        message:
          'Track ID is required.',
      },
    );
  },
);

test(
  'audio application service reports missing persistence configuration',
  async () => {
    const service =
      createService({
        persistenceConfigured:
          false,
      });

    const result =
      await service
        .analyzeAndPersist(
          '65456953',
        );

    assert.equal(
      result.status,
      'failed',
    );

    assert.equal(
      result.error,
      'Audio analysis persistence is not configured.',
    );
  },
);