import { loadConfig } from '../config/env.js';
import { createLogger } from '../logger/logger.js';
import {
  readSyncWatchOptions,
  startSyncWatch,
} from './sync-watch.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const options =
    readSyncWatchOptions();

  logger.info?.(
    {
      dbPath:
        config.rekordboxDbPath,
      ...options,
    },
    'Starting Rekordbox sync watch',
  );

  const controller =
    await startSyncWatch({
      config,
      logger,
      ...options,
    });

  await new Promise<void>(
    (resolve, reject) => {
      let stopped = false;

      const shutdown =
        async () => {
          if (stopped) {
            return;
          }

          stopped = true;

          try {
            await controller.close();

            logger.info?.(
              {},
              'Rekordbox sync watch stopped',
            );

            resolve();
          } catch (error) {
            reject(error);
          }
        };

      process.once(
        'SIGINT',
        () => {
          void shutdown();
        },
      );

      process.once(
        'SIGTERM',
        () => {
          void shutdown();
        },
      );
    },
  );
}

main().catch(
  (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `dj-sync-agent failed: ${message}`,
    );

    process.exitCode = 1;
  },
);
