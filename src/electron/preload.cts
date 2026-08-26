import electron = require('electron');

const {
  contextBridge,
  ipcRenderer,
} = electron;

contextBridge.exposeInMainWorld(
  'djSync',
  {
    getAppInfo: () =>
      ipcRenderer.invoke(
        'app:get-info',
      ),

    serviceStatus: () =>
      ipcRenderer.invoke(
        'service:status',
      ),

    serviceStart: () =>
      ipcRenderer.invoke(
        'service:start',
      ),

    serviceStop: () =>
      ipcRenderer.invoke(
        'service:stop',
      ),

    serviceRestart: () =>
      ipcRenderer.invoke(
        'service:restart',
      ),

    onServiceUpdate: (
      listener: (
        snapshot: unknown,
      ) => void,
    ) => {
      const handler = (
        _event: unknown,
        snapshot: unknown,
      ) => {
        listener(snapshot);
      };

      ipcRenderer.on(
        'service:update',
        handler,
      );

      return () => {
        ipcRenderer.removeListener(
          'service:update',
          handler,
        );
      };
    },
  },
);