export {};

declare global {
  interface Window {
    djSync: {
      getAppInfo(): Promise<{
        name: string;
        version: string;
        electronVersion: string;
        nodeVersion: string;
        platform: NodeJS.Platform;
        arch: string;
      }>;
    };
  }
}