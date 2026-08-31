import type { NormalizedTrack } from '../../rekordbox/normalized-track.js';
import type {
  LibraryPage,
  LibraryTrackSummary,
} from '../../runtime/rekordbox-library.js';
import type {
  DJSyncIntelligenceSnapshot,
  IntelligenceJob,
} from '../../runtime/dj-sync-intelligence.js';
import type {
  CopilotActionUiStatus,
} from '../../runtime/dj-sync-copilot-action-controller.js';
import type { DJSyncApplicationSnapshot as RuntimeApplicationSnapshot } from '../../runtime/dj-sync-application-state.js';
import type {
  UserSettings,
} from '../../config/user-settings.store.js';
import type {
  RecommendationConstraints,
  RecommendationContext,
  RecommendationResult,
  SetIntelligenceResult,
  SetTrackInput,
} from '../../recommendations/recommendation-types.js';
import type { DJPlaylist } from '../../core/domain/dj-playlist.js';
import type {
  SetBuildConstraints,
  SetBuildResult,
} from '../../recommendations/set-builder.js';
import type {
  DJPreferenceDimension,
  DJPreferenceKind,
  DJSessionRow,
  DJSessionSummary,
  DJSessionTrackRow,
  ExplicitPreferenceInput,
} from '../../core/local-store/ports.js';
import type {
  LiveDJContextSnapshotPublic,
  LiveSlot,
} from '../../core/live/live-dj-context-state.js';
import type {
  LiveNowPlaying,
  NowPlayingSourceType,
} from '../../core/live/now-playing-port.js';
import type {
  RecommendLiveInput,
} from '../../core/live/live-recommend.js';

export type {
  UserSettings,
};

export interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

export interface CursorPosition {
  rbLocalUsn: number;
  id: string;
}

export interface SyncLastRun {
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number | null;
  batchesProcessed: number;
  scanned: number;
  processed: number;
  completed: boolean | null;
  cursorBefore: CursorPosition | null;
  cursorAfter: CursorPosition | null;
  lastError: string | null;
}

export interface SyncStatusData {
  schemaVersion: number;
  generatedAt: string;
  service: {
    label: string;
    loaded: boolean;
    state: 'running' | 'stopped' | 'unknown';
    pid: number | null;
  };
  database: {
    path: string;
    exists: boolean;
  };
  sync: {
    mode: 'watch' | 'initial' | 'manual' | null;
    status: 'running' | 'completed' | 'paused' | 'failed' | null;
    sessionId: string | null;
    cursor: CursorPosition | null;
    totals: {
      runs: number;
      batchesProcessed: number;
      scanned: number;
      processed: number;
    };
    lastRun: SyncLastRun | null;
  };
  server: {
    apiUrl: string;
    configured: boolean;
    reachable: boolean;
    healthy: boolean;
    latencyMs: number | null;
    version: string | null;
    region: string | null;
    deploymentId: string | null;
    error: string | null;
  };
}

export type DJSyncApplicationSnapshot = RuntimeApplicationSnapshot;

export interface LibraryListOptions {
  afterId?: string | null;
  limit?: number;
  search?: string;
  readonly genres?: readonly string[] | string | null;
  readonly bpmMin?: number | null;
  readonly bpmMax?: number | null;
  readonly keys?: readonly string[] | string | null;
}

export type AudioAnalysisApplicationStatus =
  | 'idle'
  | 'verifying'
  | 'analyzing'
  | 'processing'
  | 'completed'
  | 'failed';

export interface AudioVerifiedAsset {
  path: string;
  size: number;
  checksum: string;
  algorithm: 'sha256';
  bytesRead: number;
}

export interface AudioAnalysisResult {
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  codec: string | null;
}

export interface AudioPersistenceResult {
  analysisRunId: number;
  persistedFeatures: number;
}

export interface AudioAnalysisApplicationSnapshot {
  schemaVersion: 1;
  trackId: string;
  status: AudioAnalysisApplicationStatus;
  updatedAt: string;
  filePath: string | null;
  verified: boolean;
  asset: AudioVerifiedAsset | null;
  analysis: AudioAnalysisResult | null;
  persistence: AudioPersistenceResult | null;
  persistenceConfigured: boolean;
  error: string | null;
}

export interface CopilotUiStatus {
  readonly configured: boolean;
  readonly provider: 'openai' | 'anthropic' | 'openai-compatible' | null;
  readonly model: string | null;
  readonly lastRequestAt: string | null;
  readonly lastResponseAt: string | null;
  readonly lastError: string | null;
}

export interface CopilotActionUiResult {
  readonly ok: boolean;
  readonly approvalId: string | null;
  readonly status: string | null;
  readonly error: string | null;
}

export interface CopilotPendingActionView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly risk: 'write' | 'review';
  readonly affectedResources: readonly string[];
  readonly reversible: boolean;
  readonly status: CopilotActionUiStatus | null;
  readonly approvalId: string | null;
}

export interface DJSyncRendererApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  application: {
    getState(): Promise<DJSyncApplicationSnapshot>;
    refresh(): Promise<DJSyncApplicationSnapshot>;
    start(): Promise<DJSyncApplicationSnapshot>;
    stop(): Promise<DJSyncApplicationSnapshot>;
    restart(): Promise<DJSyncApplicationSnapshot>;
    subscribe(
      listener: (snapshot: DJSyncApplicationSnapshot) => void,
    ): () => void;
  };
  library: {
    list(options?: LibraryListOptions): Promise<LibraryPage>;
    get(trackId: string): Promise<NormalizedTrack>;
  };
  copilot: {
    status(): Promise<CopilotUiStatus>;
    chat(input: {
      readonly conversationId: string;
      readonly message: string;
    }): Promise<
      | { readonly ok: true; readonly result: unknown }
      | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
    >;
  };

  copilotAction: {
    approve(actionId: string): Promise<CopilotActionUiResult>;
    reject(actionId: string): Promise<CopilotActionUiResult>;
    getCurrent(): Promise<CopilotPendingActionView | null>;
  };

  audio: {
    status(trackId: string): Promise<AudioAnalysisApplicationSnapshot>;
    analyze(trackId: string): Promise<AudioAnalysisApplicationSnapshot>;
    analyzeAndPersist(trackId: string): Promise<AudioAnalysisApplicationSnapshot>;
  };
  intelligence: {
    get(trackId: string): Promise<DJSyncIntelligenceSnapshot>;
    refresh(trackId: string): Promise<IntelligenceJob>;
    preferenceUpdate(trackId: string): Promise<IntelligenceJob>;
    retire(trackId: string): Promise<IntelligenceJob>;
  };

  settings: {
    get(): Promise<UserSettings>;
    save(input: UserSettings): Promise<UserSettings>;
  };

  recommend: {
    recommend(input: RecommendationContext): Promise<RecommendationResult>;
    analyzeSet(input: SetAnalysisContext): Promise<SetIntelligenceResult>;
    snapshot(): Promise<DJSyncRecommendationServiceSnapshot>;
  };

  setBuilder: {
    build(input: {
      readonly deviceId: string;
      readonly request: string;
      readonly trackIds: readonly string[];
      readonly startTrackId?: string;
      readonly trackCount?: number;
      readonly durationMinutes?: number;
      readonly constraints?: SetBuildConstraints;
    }): Promise<SetBuildResult>;
    analyze(input: {
      readonly deviceId: string;
      readonly request: string;
      readonly trackIds: readonly string[];
    }): Promise<SetBuildResult>;
  };

  history: {
    listSessions(limit?: number): Promise<readonly DJSessionRow[]>;
    getSession(sessionId: string): Promise<DJSessionSummary | null>;
    getSessionTracks(sessionId: string): Promise<readonly DJSessionTrackRow[]>;
  };

  preferences: {
    listValues(options?: {
      readonly dimension?: DJPreferenceDimension;
      readonly kind?: DJPreferenceKind;
    }): Promise<
      ReadonlyArray<{
        readonly value: string;
        readonly kind: DJPreferenceKind;
        readonly totalWeight: number;
        readonly lastOccurrence: string;
      }>
    >;
    isExcluded(args: {
      readonly dimension: DJPreferenceDimension;
      readonly value: string;
    }): Promise<boolean>;
    saveExplicit(input: ExplicitPreferenceInput): Promise<void>;
    removeExplicit(args: {
      readonly dimension: DJPreferenceDimension;
      readonly value: string;
    }): Promise<void>;
  };

  live: {
    getNow(): Promise<LiveNowPlaying | null>;
    pushManualTrack(input: {
      readonly trackId: string;
      readonly trackHash?: string | null;
      readonly title?: string | null;
      readonly artist?: string | null;
      readonly bpm?: number | null;
      readonly musicalKey?: string | null;
      readonly durationMs?: number | null;
      readonly energyHint01?: number | null;
    }): Promise<LiveNowPlaying>;
    tickElapsed(addMs: number): Promise<LiveNowPlaying | null>;
    recommend(input: RecommendLiveInput): Promise<RecommendationResult>;
    snapshot(): Promise<LiveDJContextSnapshotPublic | null>;
    subscribe(listener: (snapshot: LiveDJContextSnapshotPublic | null) => void): () => void;
  };

  playlist: {
    list(args?: {
      readonly search?: string;
      readonly limit?: number;
    }): Promise<readonly DJPlaylist[]>;
    get(args: {
      readonly id: string;
    }): Promise<DJPlaylist | null>;
    getTracks(args: {
      readonly id: string;
    }): Promise<readonly string[]>;
  };

  workspace: {
    aggregateStats(): Promise<WorkspaceAggregateStats>;
  };
}

export interface SetAnalysisContext {
  readonly deviceId: string;
  readonly request?: string;
  readonly setId?: string;
  readonly trackIds: readonly string[];
  readonly contextTag?: string | null;
}

export interface DJSyncRecommendationServiceSnapshot {
  readonly configured: boolean;
  readonly status: 'disabled' | 'ready' | 'error';
  readonly lastRecommendationAt: string | null;
  readonly lastSetAnalysisAt: string | null;
  readonly lastRecommendationId: string | null;
  readonly lastSetId: string | null;
  readonly lastError: string | null;
}

export interface WorkspaceAggregateStats {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly libraryTracks: number;
  readonly playlists: number;
  readonly savedSets: number;
  readonly analyzedHours: number;
  readonly liveNowPlayingSource: NowPlayingSourceType;
  readonly lastSessionAt: string | null;
}

export type {
  DJSyncIntelligenceSnapshot,
  DJPlaylist,
  IntelligenceJob,
  LibraryPage,
  LibraryTrackSummary,
  NormalizedTrack,
  SetIntelligenceResult,
};
