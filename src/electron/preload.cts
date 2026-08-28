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

    copilot: {
      status: () =>
        ipcRenderer.invoke(
          IPC_CHANNELS.copilotStatus,
        ),

      chat: (input: {
        conversationId: string;
        message: string;
      }) =>
        ipcRenderer.invoke(
          IPC_CHANNELS.copilotChatSend,
          input,
        ),
    },

    copilotAction: {
      approve: (actionId: string) =>
        ipcRenderer.invoke(
          IPC_CHANNELS.copilotActionApprove,
          actionId,
        ),

      reject: (actionId: string) =>
        ipcRenderer.invoke(
          IPC_CHANNELS.copilotActionReject,
          actionId,
        ),

      getCurrent: () =>
        ipcRenderer.invoke(
          IPC_CHANNELS.copilotActionGetCurrent,
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

    intelligence: {
      get:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.intelligenceGet,
            trackId,
          ),

      refresh:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.intelligenceRefresh,
            trackId,
          ),

      preferenceUpdate:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.intelligencePreferenceUpdate,
            trackId,
          ),

      retire:
        (
          trackId:
            string,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.intelligenceRetire,
            trackId,
          ),
    },

    settings: {
      get:
        () =>
          ipcRenderer.invoke(
            IPC_CHANNELS.settingsGet,
          ),

      save:
        (
          input:
            unknown,
        ) =>
          ipcRenderer.invoke(
            IPC_CHANNELS.settingsSave,
            input,
          ),
    },
  },
);