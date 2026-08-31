export const IPC_CHANNELS = {
  appGetInfo:
    'app:get-info',

  applicationGetState:
    'application:get-state',

  applicationRefresh:
    'application:refresh',

  applicationStart:
    'application:start',

  applicationStop:
    'application:stop',

  applicationRestart:
    'application:restart',

  applicationUpdate:
    'application:update',

  libraryList:
    'library:list',

  libraryGet:
    'library:get',

  audioStatus:
    'audio:status',

  audioAnalyze:
    'audio:analyze',

  audioAnalyzeAndPersist:
    'audio:analyze-and-persist',

  copilotStatus:
    'copilot:status',

  copilotChatSend:
    'copilot:chat-send',

  copilotActionApprove:
    'copilot:action-approve',

  copilotActionReject:
    'copilot:action-reject',

  copilotActionGetCurrent:
    'copilot:action-get-current',

  intelligenceGet:
    'intelligence:get',

  intelligenceRefresh:
    'intelligence:refresh',

  intelligencePreferenceUpdate:
    'intelligence:preference-update',

  intelligenceRetire:
    'intelligence:retire',

  settingsGet:
    'settings:get',

  settingsSave:
    'settings:save',

  recommendRecommend:
    'recommend:recommend',

  recommendAnalyzeSet:
    'recommend:analyze-set',

  recommendSnapshot:
    'recommend:snapshot',

  setBuilderBuild:
    'set-builder:build',

  setBuilderAnalyze:
    'set-builder:analyze',

  historyListSessions:
    'history:list-sessions',

  historyGetSession:
    'history:get-session',

  historyGetSessionTracks:
    'history:get-session-tracks',

  preferencesListValues:
    'preferences:list-values',

  preferencesIsExcluded:
    'preferences:is-excluded',

  preferencesSaveExplicit:
    'preferences:save-explicit',

  preferencesRemoveExplicit:
    'preferences:remove-explicit',

  liveGetNow:
    'live:get-now',

  livePushManualTrack:
    'live:push-manual-track',

  liveTickElapsed:
    'live:tick-elapsed',

  liveRecommend:
    'live:recommend',

  liveSnapshot:
    'live:snapshot',

  liveUpdate:
    'live:update',

  playlistList:
    'playlist:list',

  playlistGet:
    'playlist:get',

  playlistGetTracks:
    'playlist:get-tracks',

  rekordboxExportCollection:
    'rekordbox:export-collection',

  workspaceAggregateStats:
    'workspace:aggregate-stats',
} as const;

export type IpcChannel =
  (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];