import electron = require('electron');

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

const electronApi = Object.freeze({
  getAppInfo: (): Promise<AppInfo> =>
    electron.ipcRenderer.invoke('app:get-info'),
});

electron.contextBridge.exposeInMainWorld(
  'djSync',
  electronApi,
);