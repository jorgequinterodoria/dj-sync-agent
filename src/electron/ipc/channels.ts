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

  intelligenceGet:
    'intelligence:get',

  intelligenceRefresh:
    'intelligence:refresh',

  intelligencePreferenceUpdate:
    'intelligence:preference-update',

  intelligenceRetire:
    'intelligence:retire',
} as const;

export type IpcChannel =
  (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];