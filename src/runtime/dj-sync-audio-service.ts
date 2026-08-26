import type {
  AudioAnalysis,
  AudioAnalysisPersistenceResult,
} from '../audio/audio-analysis.js';

import {
  AudioAnalysisService,
} from '../audio/audio-analysis-service.js';

import {
  analyzeAudioFile,
} from '../audio/audio-analyzer.js';

import {
  verifyAudioAsset,
  type VerifiedAudioAsset,
} from '../audio/audio-verifier.js';

import {
  SupabaseAudioAnalysisRunPersistence,
  type AudioAnalysisRunPersistencePort,
} from '../audio/audio-analysis-run-persistence.js';

import type {
  RekordboxLibraryService,
} from './rekordbox-library.js';

export type AudioAnalysisApplicationStatus =
  | 'idle'
  | 'verifying'
  | 'analyzing'
  | 'processing'
  | 'completed'
  | 'failed';

export interface AudioAnalysisApplicationSnapshot {
  schemaVersion: 1;

  trackId: string;

  status:
    AudioAnalysisApplicationStatus;

  updatedAt: string;

  filePath:
    | string
    | null;

  verified: boolean;

  asset:
    | VerifiedAudioAsset
    | null;

  analysis:
    | AudioAnalysis
    | null;

  persistence:
    | AudioAnalysisPersistenceResult
    | null;

  persistenceConfigured:
    boolean;

  error:
    | string
    | null;
}

export interface DJSyncAudioApplicationService {
  status(
    trackId: string,
  ):
    Promise<
      AudioAnalysisApplicationSnapshot
    >;

  analyze(
    trackId: string,
  ):
    Promise<
      AudioAnalysisApplicationSnapshot
    >;

  analyzeAndPersist(
    trackId: string,
  ):
    Promise<
      AudioAnalysisApplicationSnapshot
    >;
}

export interface CreateDJSyncAudioApplicationServiceOptions {
  library:
    Pick<
      RekordboxLibraryService,
      'getById'
    >;

  analysisService:
    AudioAnalysisService;

  verifier:
    (
      filePath: string,
    ) =>
      Promise<
        VerifiedAudioAsset
      >;

  runPersistence:
    AudioAnalysisRunPersistencePort;

  persistenceConfigured:
    boolean;
}

export function createDJSyncAudioApplicationService(
  options:
    CreateDJSyncAudioApplicationServiceOptions,
):
  DJSyncAudioApplicationService {
  const states =
    new Map<
      string,
      AudioAnalysisApplicationSnapshot
    >();

  function buildSnapshot(
    trackId: string,
    overrides:
      Partial<
        AudioAnalysisApplicationSnapshot
      > = {},
  ):
    AudioAnalysisApplicationSnapshot {
    const previous =
      states.get(trackId);

    return {
      schemaVersion: 1,

      trackId,

      status:
        previous?.status ??
        'idle',

      updatedAt:
        new Date().toISOString(),

      filePath:
        previous?.filePath ??
        null,

      verified:
        previous?.verified ??
        false,

      asset:
        previous?.asset ??
        null,

      analysis:
        previous?.analysis ??
        null,

      persistence:
        previous?.persistence ??
        null,

      persistenceConfigured:
        options.persistenceConfigured,

      error:
        previous?.error ??
        null,

      ...overrides,
    };
  }

  function save(
    snapshot:
      AudioAnalysisApplicationSnapshot,
  ):
    AudioAnalysisApplicationSnapshot {
    states.set(
      snapshot.trackId,
      snapshot,
    );

    return snapshot;
  }

  async function resolveTrack(
    trackId: string,
  ): Promise<{
    trackId: string;
    filePath: string;
  }> {
    const normalizedTrackId =
      trackId.trim();

    if (
      !normalizedTrackId
    ) {
      throw new Error(
        'Track ID is required.',
      );
    }

    const track =
      await options.library.getById(
        normalizedTrackId,
      );

    const filePath =
      track.primaryFile.localPath ??
      track.primaryFile.path;

    if (
      !filePath?.trim()
    ) {
      throw new Error(
        `Track ${normalizedTrackId} has no audio file path.`,
      );
    }

    return {
      trackId:
        normalizedTrackId,

      filePath:
        filePath.trim(),
    };
  }

  return {
    async status(
      trackId,
    ):
      Promise<
        AudioAnalysisApplicationSnapshot
      > {
      const resolved =
        await resolveTrack(
          trackId,
        );

      return save(
        buildSnapshot(
          resolved.trackId,
          {
            status:
              'idle',

            filePath:
              resolved.filePath,

            error:
              null,
          },
        ),
      );
    },

    async analyze(
      trackId,
    ):
      Promise<
        AudioAnalysisApplicationSnapshot
      > {
      const resolved =
        await resolveTrack(
          trackId,
        );

      try {
        save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'verifying',

              filePath:
                resolved.filePath,

              verified:
                false,

              error:
                null,
            },
          ),
        );

        const asset =
          await options.verifier(
            resolved.filePath,
          );

        save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'analyzing',

              filePath:
                resolved.filePath,

              verified:
                true,

              asset,

              error:
                null,
            },
          ),
        );

        const analysis =
          await options
            .analysisService
            .analyze(
              resolved.filePath,
            );

        return save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'completed',

              filePath:
                resolved.filePath,

              verified:
                true,

              asset,

              analysis,

              persistence:
                null,

              error:
                null,
            },
          ),
        );
      } catch (error) {
        return save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'failed',

              filePath:
                resolved.filePath,

              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          ),
        );
      }
    },

    async analyzeAndPersist(
      trackId,
    ):
      Promise<
        AudioAnalysisApplicationSnapshot
      > {
      const resolved =
        await resolveTrack(
          trackId,
        );

      if (
        !options.persistenceConfigured
      ) {
        return save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'failed',

              filePath:
                resolved.filePath,

              error:
                'Audio analysis persistence is not configured.',
            },
          ),
        );
      }

      try {
        save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'verifying',

              filePath:
                resolved.filePath,

              verified:
                false,

              persistence:
                null,

              error:
                null,
            },
          ),
        );

        const asset =
          await options.verifier(
            resolved.filePath,
          );

        save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'analyzing',

              filePath:
                resolved.filePath,

              verified:
                true,

              asset,

              error:
                null,
            },
          ),
        );

        const analysis =
          await options
            .analysisService
            .analyze(
              resolved.filePath,
            );

        save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'processing',

              filePath:
                resolved.filePath,

              verified:
                true,

              asset,

              analysis,

              error:
                null,
            },
          ),
        );

        const persistence =
          await options
            .runPersistence
            .persistVerifiedAnalysis(
              resolved.trackId,
              analysis,
              asset,
            );

        return save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'completed',

              filePath:
                resolved.filePath,

              verified:
                true,

              asset,

              analysis,

              persistence,

              error:
                null,
            },
          ),
        );
      } catch (error) {
        return save(
          buildSnapshot(
            resolved.trackId,
            {
              status:
                'failed',

              filePath:
                resolved.filePath,

              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          ),
        );
      }
    },
  };
}

export function createDefaultDJSyncAudioApplicationService(
  library:
    Pick<
      RekordboxLibraryService,
      'getById'
    >,
):
  DJSyncAudioApplicationService {
  const deviceId =
    process.env.SYNC_AGENT_ID?.trim() ??
    '';

  const runPersistence =
    deviceId
      ? new SupabaseAudioAnalysisRunPersistence(
          deviceId,
        )
      : null;

  const analysisService =
    new AudioAnalysisService({
      analyzer:
        async (
          filePath,
        ) =>
          analyzeAudioFile(
            filePath,
          ),

      verifier:
        async (
          filePath,
        ) =>
          verifyAudioAsset(
            filePath,
          ),
    });

  return createDJSyncAudioApplicationService(
    {
      library,

      analysisService,

      verifier:
        async (
          filePath,
        ) =>
          verifyAudioAsset(
            filePath,
          ),

      runPersistence:
        runPersistence ??
        {
          async persistVerifiedAnalysis() {
            throw new Error(
              'Audio analysis persistence is not configured.',
            );
          },
        },

      persistenceConfigured:
        runPersistence !== null,
    },
  );
}