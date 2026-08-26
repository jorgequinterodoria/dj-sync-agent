import electron = require('electron');

const {
  contextBridge,
  ipcRenderer,
} = electron;

const IPC_CHANNELS = {
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
} as const;

contextBridge.exposeInMainWorld(
  'djSync',
  {
    app: {
      getInfo:
        () =>
          ipcRenderer.invoke(
            IPC_CHANNELS.appGetInfo,
          ),
    },

    application: {
      getState:
        () =>
          ipcRenderer.invoke(
            IPC_CHANNELS.applicationGetState,
          ),

      refresh:
        () =>
          ipcRenderer.invoke(
            IPC_CHANNELS.applicationRefresh,
          ),

      start:
        () =>
          ipcRenderer.invoke(
            IPC_CHANNELS.applicationStart,
          ),

      stop:
        () =>
          ipcRenderer.invoke(
            IPC_CHANNELS.applicationStop,
          ),

      restart:
        () =>
          ipcRenderer.invoke(
            IPC_CHANNELS.applicationRestart,
          ),

      subscribe: (
        listener: (
          snapshot: unknown,
        ) => void,
      ) => {
        const handler = (
          _event: unknown,
          snapshot: unknown,
        ) => {
          listener(
            snapshot,
          );
        };

        ipcRenderer.on(
          IPC_CHANNELS.applicationUpdate,
          handler,
        );

        return () => {
          ipcRenderer.removeListener(
            IPC_CHANNELS.applicationUpdate,
            handler,
          );
        };
      },
    },

    library: {
      list:
        (
          options?: {
            afterId?:
              | string
              | null;

            limit?:
              number;

            search?:
              string;
          },
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.libraryList,
            options,
          ),

      get:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.libraryGet,
            trackId,
          ),
    },

    audio: {
      status:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.audioStatus,
            trackId,
          ),

      analyze:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.audioAnalyze,
            trackId,
          ),

      analyzeAndPersist:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.audioAnalyzeAndPersist,
            trackId,
          ),
    },
  },
);