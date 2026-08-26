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
} as const;

export type IpcChannel =
  (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];