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

    runtimeStart: () =>
      ipcRenderer.invoke(
        'runtime:start',
      ),

    runtimeStop: () =>
      ipcRenderer.invoke(
        'runtime:stop',
      ),

    runtimeStatus: () =>
      ipcRenderer.invoke(
        'runtime:status',
      ),

    onRuntimeUpdate: (
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
        'runtime:update',
        handler,
      );

      return () => {
        ipcRenderer.removeListener(
          'runtime:update',
          handler,
        );
      };
    },
  },
);