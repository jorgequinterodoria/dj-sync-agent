import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncIntelligenceService,
  type IntelligenceAnalysisStatus,
  type IntelligenceJob,
} from './dj-sync-intelligence.js';

import type {
  NormalizedTrack,
} from '../rekordbox/normalized-track.js';

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
        'House',

      label:
        null,

      key:
        'C',

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
        4,

      playCount:
        12,

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
        1502067,

      updatedAt:
        '2026-08-26T20:00:00.000Z',
    },
  };
}

function createIntelligence() {
  return {
    id:
      1,

    deviceId:
      'macbook-air-jorge-1',

    trackId:
      '65456953',

    trackUuid:
      null,

    trackHash:
      'HASH-1',

    title:
      'Old Title',

    artist:
      'Old Artist',

    album:
      null,

    genre:
      'House',

    key:
      'C',

    bpm:
      124,

    lengthSeconds:
      208,

    bitrate:
      128,

    sampleRate:
      44100,

    rating:
      3,

    playCount:
      10,

    analysisStatus:
      'baseline_ready' as IntelligenceAnalysisStatus,

    analysisVersion:
      1,

    sourceEventId:
      null,

    sourceRbLocalUsn:
      1500000,

    analyzedAt:
      null,

    isDeleted:
      false,

    createdAt:
      '2026-08-20T00:00:00.000Z',

    updatedAt:
      '2026-08-20T00:00:00.000Z',
  };
}

function createJob(
  type:
    IntelligenceJob['jobType'],
):
  IntelligenceJob {
  return {
    id:
      10,

    jobKey:
      'job-key',

    jobType:
      type,

    status:
      'pending',

    priority:
      50,

    eventId:
      'event-1',

    deviceId:
      'macbook-air-jorge-1',

    trackId:
      '65456953',

    rbLocalUsn:
      1502067,

    attempts:
      0,

    availableAt:
      '2026-08-26T20:00:00.000Z',

    lockedAt:
      null,

    startedAt:
      null,

    completedAt:
      null,

    lastError:
      null,

    createdAt:
      '2026-08-26T20:00:00.000Z',

    updatedAt:
      '2026-08-26T20:00:00.000Z',
  };
}

function createRepositoryMock() {
  const inserted:
    Array<{
      jobKey: string;
      jobType: string;
      priority: number;
      eventId: string;
      deviceId: string;
      trackId: string;
      rbLocalUsn:
        number | null;
      payload: unknown;
    }> = [];

  const intelligence =
    createIntelligence();

  return {
    inserted,

    async getSnapshot(
      _deviceId: string,
      _trackId: string,
    ) {
      return {
        intelligence,

        latestAnalysis: {
          analysisRunId:
            37,

          deviceId:
            'macbook-air-jorge-1',

          trackId:
            '65456953',

          sourceEventId:
            null,

          sourceRbLocalUsn:
            null,

          trackHash:
            'HASH-1',

          analysisVersion:
            1,

          pipelineVersion:
            '3.2',

          executionContext:
            'production',

          status:
            'completed',

          startedAt:
            '2026-08-26T20:04:12.000Z',

          completedAt:
            '2026-08-26T20:04:20.000Z',

          lastError:
            null,

          createdAt:
            '2026-08-26T20:04:12.000Z',

          updatedAt:
            '2026-08-26T20:04:20.000Z',
        },

        latestFeatures: [
          {
            deviceId:
              'macbook-air-jorge-1',

            trackId:
              '65456953',

            analysisRunId:
              37,

            featureGroup:
              'audio',

            featureKey:
              'codec',

            numericValue:
              null,

            textValue:
              'mp3',

            booleanValue:
              null,

            jsonValue:
              null,

            unit:
              null,

            source:
              'audio',

            confidence:
              1,

            createdAt:
              '2026-08-26T20:04:17.000Z',
          },
        ],

        jobs: [
          createJob(
            'track.intelligence.refresh',
          ),
        ],
      };
    },

    async insertJob(
      input: {
        jobKey: string;
        jobType:
          | 'track.intelligence.refresh'
          | 'track.preference.update'
          | 'track.intelligence.retire';
        priority: number;
        eventId: string;
        deviceId: string;
        trackId: string;
        rbLocalUsn:
          | number
          | null;
        payload: unknown;
      },
    ) {
      inserted.push(
        input,
      );

      return {
        ...createJob(
          input.jobType,
        ),

        jobKey:
          input.jobKey,

        priority:
          input.priority,

        eventId:
          input.eventId,

        deviceId:
          input.deviceId,

        trackId:
          input.trackId,

        rbLocalUsn:
          input.rbLocalUsn,
      };
    },
  };
}

function createService() {
  const repository =
    createRepositoryMock();

  const service =
    createDJSyncIntelligenceService({
      deviceId:
        'macbook-air-jorge-1',

      library: {
        getById:
          async () =>
            createTrack(),
      },

      repository,
    });

  return {
    service,
    repository,
  };
}

test(
  'intelligence service returns consolidated intelligence state',
  async () => {
    const {
      service,
    } =
      createService();

    const result =
      await service.get(
        '65456953',
      );

    assert.equal(
      result.schemaVersion,
      1,
    );

    assert.equal(
      result.deviceId,
      'macbook-air-jorge-1',
    );

    assert.equal(
      result.trackId,
      '65456953',
    );

    assert.equal(
      result.intelligence?.analysisStatus,
      'baseline_ready',
    );

    assert.equal(
      result.latestAnalysis.analysisRunId,
      37,
    );

    assert.equal(
      result.latestFeatures.length,
      1,
    );

    assert.equal(
      result.jobs.length,
      1,
    );
  },
);

test(
  'intelligence service enqueues refresh jobs',
  async () => {
    const {
      service,
      repository,
    } =
      createService();

    const job =
      await service.enqueueRefresh(
        '65456953',
      );

    assert.equal(
      job.jobType,
      'track.intelligence.refresh',
    );

    assert.equal(
      repository.inserted.length,
      1,
    );

    const input =
      repository.inserted[0];

    assert.equal(
      input?.deviceId,
      'macbook-air-jorge-1',
    );

    assert.equal(
      input?.trackId,
      '65456953',
    );

    assert.equal(
      input?.priority,
      50,
    );

    assert.match(
      input?.jobKey ?? '',
      /macbook-air-jorge-1:65456953:track\.intelligence\.refresh:HASH-1/,
    );

    assert.equal(
      (
        input?.payload as {
          reason: string;
        }
      ).reason,
      'manual_desktop_refresh',
    );
  },
);

test(
  'intelligence service enqueues preference jobs',
  async () => {
    const {
      service,
      repository,
    } =
      createService();

    const job =
      await service
        .enqueuePreferenceUpdate(
          '65456953',
        );

    assert.equal(
      job.jobType,
      'track.preference.update',
    );

    assert.equal(
      repository.inserted.length,
      1,
    );

    const input =
      repository.inserted[0];

    assert.equal(
      input?.priority,
      40,
    );
  },
);

test(
  'intelligence service enqueues retire jobs',
  async () => {
    const {
      service,
      repository,
    } =
      createService();

    const job =
      await service.enqueueRetire(
        '65456953',
      );

    assert.equal(
      job.jobType,
      'track.intelligence.retire',
    );

    assert.equal(
      repository.inserted.length,
      1,
    );

    const input =
      repository.inserted[0];

    assert.equal(
      input?.priority,
      70,
    );
  },
);

test(
  'intelligence service rejects empty track ids',
  async () => {
    const {
      service,
    } =
      createService();

    await assert.rejects(
      () =>
        service.get(
          '   ',
        ),
      {
        message:
          'Track ID is required.',
      },
    );

    await assert.rejects(
      () =>
        service.enqueueRefresh(
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
  'intelligence service requires a device id',
  () => {
    assert.throws(
      () =>
        createDJSyncIntelligenceService({
          deviceId:
            '   ',

          library: {
            getById:
              async () =>
                createTrack(),
          },

          repository:
            createRepositoryMock(),
        }),
      {
        message:
          'SYNC_AGENT_ID is required.',
      },
    );
  },
);