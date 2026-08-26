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

    applicationStatus: () =>
      ipcRenderer.invoke(
        'application:status',
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

    onApplicationUpdate: (
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
        'application:update',
        handler,
      );

      return () => {
        ipcRenderer.removeListener(
          'application:update',
          handler,
        );
      };
    },
  },
);