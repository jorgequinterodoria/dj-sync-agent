import { join } from 'node:path';
import {
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';

import {
  IPC_CHANNELS,
} from './channels.js';

import type {
  AppInfo,
  LibraryListOptions,
  SetAnalysisContext,
  WorkspaceAggregateStats,
} from './contracts.js';

import type {
  DJSyncApplicationState,
} from '../../runtime/dj-sync-application-state.js';

import type {
  RekordboxLibraryService,
} from '../../runtime/rekordbox-library.js';

import {
  createDefaultDJSyncAudioApplicationService,
} from '../../runtime/dj-sync-audio-service.js';

import {
  createDefaultDJSyncIntelligenceService,
} from '../../runtime/dj-sync-intelligence.js';

import {
  readUserSettings,
  writeUserSettings,
} from '../../config/user-settings.store.js';

import {
  createRecommendationEngine,
} from '../../recommendations/recommendation-engine.js';
import {
  createDJSyncRecommendationService,
} from '../../runtime/dj-sync-recommendation-service.js';
import type {
  RecommendationContext,
  SetTrackInput,
} from '../../recommendations/recommendation-types.js';

import {
  createDJSyncSetBuilderService,
} from '../../runtime/dj-sync-set-builder-service.js';

import {
  SQLiteCopilotDbStore,
} from '../../core/local-store/sqlite-store.js';
import type {
  DJPreferenceDimension,
  DJPreferenceKind,
  ExplicitPreferenceInput,
} from '../../core/local-store/ports.js';

import {
  ManualNowPlayingSource,
} from '../../core/live/now-playing-port.js';
import {
  LiveDJContextService,
} from '../../core/live/live-dj-context-state.js';
import {
  recommendLive,
} from '../../core/live/live-recommend.js';
import type {
  RekordboxWritePort,
} from '../../rekordbox/rekordbox-write-port.js';
import type {
  RecommendLiveInput,
} from '../../core/live/live-recommend.js';

export interface RegisterIpcHandlersOptions {
  applicationState:
    DJSyncApplicationState;

  library:
    RekordboxLibraryService;

  getAppInfo:
    () => AppInfo;

  userDataDir:
    string;

  getSenderWebContents?:
    () => WebContents | null;

  rekordboxWritePort?: RekordboxWritePort;
}

export function registerIpcHandlers(
  options:
    RegisterIpcHandlersOptions,
): void {
  let audioService:
    | ReturnType<
      typeof createDefaultDJSyncAudioApplicationService
    >
    | null =
    null;
  let audioInitError:
    | string
    | null =
    null;

  let intelligenceService:
    | ReturnType<
      typeof createDefaultDJSyncIntelligenceService
    >
    | null =
    null;
  let intelligenceInitError:
    | string
    | null =
    null;

  try {
    audioService =
      createDefaultDJSyncAudioApplicationService(
        options.library,
      );
  } catch (error) {
    audioInitError =
      error instanceof Error
        ? error.message
        : String(error);
  }

  try {
    intelligenceService =
      createDefaultDJSyncIntelligenceService(
        options.library,
      );
  } catch (error) {
    intelligenceInitError =
      error instanceof Error
        ? error.message
        : String(error);
  }

  function getAudioServiceOrThrow():
    | ReturnType<
      typeof createDefaultDJSyncAudioApplicationService
    > {
    if (audioService === null) {
      throw new Error(
        `Audio service unavailable: ${audioInitError ?? 'Unknown error'}`,
      );
    }

    return audioService;
  }

  function getIntelligenceServiceOrThrow():
    | ReturnType<
      typeof createDefaultDJSyncIntelligenceService
    > {
    if (intelligenceService === null) {
      throw new Error(
        `Intelligence service unavailable: ${
          intelligenceInitError ??
          'Configure SYNC_AGENT_ID and SYNC_API_KEY in Settings.'
        }`,
      );
    }

    return intelligenceService;
  }

  ipcMain.handle(
    IPC_CHANNELS.appGetInfo,
    (
      _event:
        IpcMainInvokeEvent,
    ) => {
      return options.getAppInfo();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationGetState,
    async () => {
      return options
        .applicationState
        .snapshot();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationRefresh,
    async () => {
      return options
        .applicationState
        .refresh();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationStart,
    async () => {
      return options
        .applicationState
        .start();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationStop,
    async () => {
      return options
        .applicationState
        .stop();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.applicationRestart,
    async () => {
      return options
        .applicationState
        .restart();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.libraryList,
    async (
      _event,
      input:
        | LibraryListOptions
        | undefined,
    ) => {
      return options
        .library
        .list(
          input,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.libraryGet,
    async (
      _event,
      trackId: string,
    ) => {
      return options
        .library
        .getById(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.audioStatus,
    async (
      _event,
      trackId: string,
    ) => {
      return getAudioServiceOrThrow()
        .status(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.audioAnalyze,
    async (
      _event,
      trackId: string,
    ) => {
      return getAudioServiceOrThrow()
        .analyze(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.audioAnalyzeAndPersist,
    async (
      _event,
      trackId: string,
    ) => {
      return getAudioServiceOrThrow()
        .analyzeAndPersist(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligenceGet,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .get(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligenceRefresh,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .enqueueRefresh(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligencePreferenceUpdate,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .enqueuePreferenceUpdate(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.intelligenceRetire,
    async (
      _event,
      trackId: string,
    ) => {
      return getIntelligenceServiceOrThrow()
        .enqueueRetire(
          trackId,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsGet,
    async () => {
      return readUserSettings();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsSave,
    async (
      _event,
      input,
    ) => {
      const saved =
        writeUserSettings(
          input,
        );

      return saved;
    },
  );

  let recommendationService:
    | ReturnType<
      typeof createDJSyncRecommendationService
    >
    | null = null;
  let recommendationInitError: string | null = null;
  try {
    recommendationService = createDJSyncRecommendationService({
      engine: createRecommendationEngine(),
    });
  } catch (error) {
    recommendationInitError =
      error instanceof Error ? error.message : String(error);
  }
  function getRecommendationServiceOrThrow() {
    if (!recommendationService) {
      throw new Error(
        `Recommendation service unavailable: ${
          recommendationInitError ?? 'Unknown error'
        }`,
      );
    }
    return recommendationService;
  }

  ipcMain.handle(
    IPC_CHANNELS.recommendRecommend,
    async (
      _event,
      input: RecommendationContext,
    ) => {
      return getRecommendationServiceOrThrow().recommend(input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.recommendAnalyzeSet,
    async (
      _event,
      input: SetAnalysisContext,
    ) => {
      const {
        deviceId,
        request,
        trackIds,
      } = input;
      const candidates = await Promise.all(
        trackIds.map(async (id) => {
          const track = await options.library.getById(id).catch(() => null);
          if (!track) {
            return null;
          }
          const c: SetTrackInput = {
            trackId: track.identity.id,
            title: track.metadata.title ?? null,
            artist: track.metadata.artist ?? null,
            bpm: track.technical.bpm ?? null,
            key: track.metadata.key ?? null,
            energy: null,
          };
          return c;
        }),
      ).then((list) =>
        list.filter(
          (value): value is NonNullable<typeof value> => value !== null,
        ),
      );
      return getRecommendationServiceOrThrow().analyzeSet({
        deviceId,
        request: request ?? `Set analysis ${new Date().toISOString()}`,
        tracks: candidates,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.recommendSnapshot,
    async () => {
      return getRecommendationServiceOrThrow().snapshot();
    },
  );

  let setBuilderService:
    | ReturnType<typeof createDJSyncSetBuilderService>
    | null = null;
  let setBuilderInitError: string | null = null;
  try {
    setBuilderService = createDJSyncSetBuilderService({
      async getTrack(trackId) {
        const track = await options.library.getById(trackId).catch(() => null);
        if (!track) {
          return null;
        }
        return {
          trackId: track.identity.id,
          title: track.metadata.title ?? null,
          artist: track.metadata.artist ?? null,
          bpm: track.technical.bpm ?? null,
          key: track.metadata.key ?? null,
          energy: null,
        };
      },
    });
  } catch (error) {
    setBuilderInitError =
      error instanceof Error ? error.message : String(error);
  }
  function getSetBuilderServiceOrThrow() {
    if (!setBuilderService) {
      throw new Error(
        `Set Builder service unavailable: ${
          setBuilderInitError ?? 'Unknown error'
        }`,
      );
    }
    return setBuilderService;
  }

  ipcMain.handle(
    IPC_CHANNELS.setBuilderBuild,
    async (
      _event,
      input: Parameters<
        ReturnType<typeof createDJSyncSetBuilderService>['build']
      >[0],
    ) => {
      return getSetBuilderServiceOrThrow().build(input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setBuilderAnalyze,
    async (
      _event,
      input: Parameters<
        ReturnType<typeof createDJSyncSetBuilderService>['analyze']
      >[0],
    ) => {
      return getSetBuilderServiceOrThrow().analyze(input);
    },
  );

  const copilotDb = new SQLiteCopilotDbStore(
    join(options.userDataDir, 'copilot.db'),
  );
  const DEFAULT_DEVICE_ID = 'electron-main';

  ipcMain.handle(
    IPC_CHANNELS.historyListSessions,
    async (
      _event,
      limit: number | undefined,
    ) => {
      return copilotDb.listSessions(limit);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.historyGetSession,
    async (
      _event,
      sessionId: string,
    ) => {
      return copilotDb.getSession(sessionId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.historyGetSessionTracks,
    async (
      _event,
      sessionId: string,
    ) => {
      return copilotDb.getSessionTracks(sessionId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.preferencesListValues,
    async (
      _event,
      input: {
        readonly dimension?: DJPreferenceDimension;
        readonly kind?: DJPreferenceKind;
      } | undefined,
    ) => {
      const dimension = input?.dimension;
      if (!dimension) {
        return [];
      }
      if (input?.kind !== undefined) {
        return copilotDb.listValues({
          deviceId: DEFAULT_DEVICE_ID,
          dimension,
          kind: input.kind,
        });
      }
      return copilotDb.listValues({
        deviceId: DEFAULT_DEVICE_ID,
        dimension,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.preferencesIsExcluded,
    async (
      _event,
      input: {
        readonly dimension: DJPreferenceDimension;
        readonly value: string;
      },
    ) => {
      return copilotDb.isExcluded({
        deviceId: DEFAULT_DEVICE_ID,
        dimension: input.dimension,
        value: input.value,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.preferencesSaveExplicit,
    async (
      _event,
      input: ExplicitPreferenceInput,
    ) => {
      const deviceId = (input.deviceId || DEFAULT_DEVICE_ID).trim();
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const base = {
        deviceId,
        dimension: input.dimension,
        value: input.value,
        kind: input.kind,
        source: input.source ?? 'explicit' as const,
        occurredAt,
      } as const;
      if (input.weight !== undefined) {
        const normalized: ExplicitPreferenceInput = {
          ...base,
          weight: input.weight,
        };
        await copilotDb.recordExplicit(normalized, normalized.occurredAt);
      } else {
        const normalized: ExplicitPreferenceInput = base;
        await copilotDb.recordExplicit(normalized, normalized.occurredAt);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.preferencesRemoveExplicit,
    async (
      _event,
      input: {
        readonly dimension: DJPreferenceDimension;
        readonly value: string;
        readonly kind?: DJPreferenceKind;
      },
    ) => {
      await copilotDb.removeExplicit({
        deviceId: DEFAULT_DEVICE_ID,
        dimension: input.dimension,
        value: input.value,
        kind: input.kind ?? 'excluded',
      });
    },
  );

  const liveManualSource = new ManualNowPlayingSource();
  let liveDJContext: LiveDJContextService | null = null;
  let liveTickTimer: ReturnType<typeof setInterval> | null = null;
  try {
    liveDJContext = new LiveDJContextService({
      sessionId: `electron-session-${Date.now()}`,
      deviceId: DEFAULT_DEVICE_ID,
      source: liveManualSource,
    });
  } catch {
    liveDJContext = null;
  }

  function broadcastLiveUpdate(): void {
    const webContents = options.getSenderWebContents
      ? options.getSenderWebContents()
      : null;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }
    const snapshot = liveDJContext?.getSnapshot() ?? null;
    webContents.send(IPC_CHANNELS.liveUpdate, snapshot);
  }

  if (liveDJContext) {
    liveTickTimer = setInterval(async () => {
      try {
        if (!liveDJContext) {
          return;
        }
        await liveDJContext.tick(1000);
        broadcastLiveUpdate();
      } catch {
        // no-op
      }
    }, 1000);
  }

  ipcMain.handle(
    IPC_CHANNELS.liveGetNow,
    async () => {
      return liveManualSource.getCurrent();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.livePushManualTrack,
    async (
      _event,
      input: Parameters<ManualNowPlayingSource['pushTrack']>[0],
    ) => {
      const result = liveManualSource.pushTrack(input);
      broadcastLiveUpdate();
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.liveTickElapsed,
    async (
      _event,
      addMs: number,
    ) => {
      const np = liveManualSource.tickElapsed(addMs);
      broadcastLiveUpdate();
      return np;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.liveRecommend,
    async (
      _event,
      input: RecommendLiveInput,
    ) => {
      return recommendLive(input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.liveSnapshot,
    async () => {
      return liveDJContext?.getSnapshot() ?? null;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.playlistList,
    async (
      _event,
      args:
        | {
          readonly search?: string;
          readonly limit?: number;
        }
        | undefined,
    ) => {
      try {
        const lib =
          options.library as unknown as {
            listPlaylists?: (
              args?: {
                readonly search?: string;
                readonly limit?: number;
              },
            ) => Promise<
              readonly {
                readonly id: string;
                readonly name: string;
                readonly trackIds: readonly string[];
                readonly parentId: string | null;
                readonly source: 'rekordbox' | 'local';
                readonly updatedAt: string | null;
              }[]
            >;
          };
        if (typeof lib.listPlaylists !== 'function') return [];
        const rows = await lib.listPlaylists(args ?? {});
        return rows.slice(
          0,
          Math.max(1, Math.min(1000, Number(args?.limit ?? 500) || 500)),
        );
      } catch (error) {
        console.warn('[ipc] playlist list failed', error);
        return [];
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.playlistGet,
    async (
      _event,
      args: {
        readonly id: string;
      },
    ) => {
      try {
        const lib =
          options.library as unknown as {
            getPlaylist?: (
              id: string,
            ) => Promise<{
              readonly id: string;
              readonly name: string;
              readonly trackIds: readonly string[];
              readonly parentId: string | null;
              readonly source: 'rekordbox' | 'local';
              readonly updatedAt: string | null;
            } | null>;
          };
        if (typeof lib.getPlaylist !== 'function') return null;
        return lib.getPlaylist(String(args?.id ?? ''));
      } catch (error) {
        console.warn('[ipc] playlist get failed', error);
        return null;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.playlistGetTracks,
    async (
      _event,
      args: {
        readonly id: string;
      },
    ) => {
      try {
        const lib =
          options.library as unknown as {
            getPlaylistTrackIds?: (
              id: string,
            ) => Promise<readonly string[]>;
          };
        if (typeof lib.getPlaylistTrackIds !== 'function') return [];
        return lib.getPlaylistTrackIds(String(args?.id ?? ''));
      } catch (error) {
        console.warn('[ipc] playlist get tracks failed', error);
        return [];
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.rekordboxExportCollection,
    async () => {
      if (!options.rekordboxWritePort) {
        throw new Error('Rekordbox write port is unavailable.');
      }
      return options.rekordboxWritePort.exportCollection();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.workspaceAggregateStats,
    async (): Promise<WorkspaceAggregateStats> => {
      const generatedAt = new Date().toISOString();
      let libraryTracks = 0;
      let playlists = 0;
      try {
        const page = await options.library.list({ limit: 1 });
        libraryTracks = Number(page.total ?? 0) || 0;
      } catch {
        libraryTracks = 0;
      }
      try {
        const lib =
          options.library as unknown as {
            listPlaylists?: (
              args?: {
                readonly limit?: number;
              },
            ) => Promise<
              readonly {
                readonly id: string;
              }[]
            >;
          };
        if (typeof lib.listPlaylists === 'function') {
          const rows = await lib.listPlaylists({ limit: 2000 });
          playlists = rows.length;
        }
      } catch {
        playlists = 0;
      }
      let savedSets = 0;
      let analyzedHours = 0;
      let lastSessionAt: string | null = null;
      try {
        const sessions = await copilotDb.listSessions(1);
        if (sessions[0]) {
          lastSessionAt = sessions[0].ended_at ?? sessions[0].started_at ?? null;
        }
        const allSessions = await copilotDb.listSessions(200);
        savedSets = allSessions.length;
        let totalMs = 0;
        for (const s of allSessions) {
          const start = s.started_at ? Date.parse(s.started_at) : NaN;
          const end = s.ended_at ? Date.parse(s.ended_at) : NaN;
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            totalMs += end - start;
          }
        }
        analyzedHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
      } catch {
        savedSets = 0;
        analyzedHours = 0;
      }
      return {
        schemaVersion: 1,
        generatedAt,
        libraryTracks,
        playlists,
        savedSets,
        analyzedHours,
        liveNowPlayingSource: liveManualSource.sourceType,
        lastSessionAt,
      };
    },
  );
}