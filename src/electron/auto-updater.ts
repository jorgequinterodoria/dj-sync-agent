import {
  app,
} from 'electron';

import pino from 'pino';
import {
  createRequire,
} from 'node:module';
import {
  fileURLToPath,
} from 'node:url';

const logger =
  pino({ name: 'updater' });

const require =
  createRequire(
    import.meta.url ??
      fileURLToPath(
        import.meta.url,
      ),
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyUpdater = any;

let cachedUpdater:
  | AnyUpdater
  | null =
  null;

const IS_MAC =
  process.platform ===
  'darwin';

const IS_WIN =
  process.platform ===
  'win32';

function resolveUpdater():
  AnyUpdater {
  if (
    cachedUpdater !==
    null
  ) {
    return cachedUpdater;
  }

  const electronUpdaterModule =
    require(
      'electron-updater',
    ) as {
      autoUpdater?:
        AnyUpdater;
      AppUpdater?: new () =>
        AnyUpdater;
      MacUpdater?: new () =>
        AnyUpdater;
      NsisUpdater?: new () =>
        AnyUpdater;
    };

  if (
    typeof electronUpdaterModule
      .autoUpdater ===
      'object' &&
    electronUpdaterModule
      .autoUpdater !==
      null
  ) {
    cachedUpdater =
      electronUpdaterModule
        .autoUpdater;

    return cachedUpdater;
  }

  if (
    IS_MAC &&
    typeof electronUpdaterModule
      .MacUpdater ===
      'function'
  ) {
    cachedUpdater =
      new electronUpdaterModule.MacUpdater();

    return cachedUpdater;
  }

  if (
    IS_WIN &&
    typeof electronUpdaterModule
      .NsisUpdater ===
      'function'
  ) {
    cachedUpdater =
      new electronUpdaterModule.NsisUpdater();

    return cachedUpdater;
  }

  if (
    typeof electronUpdaterModule
      .AppUpdater ===
      'function'
  ) {
    cachedUpdater =
      new electronUpdaterModule.AppUpdater();

    return cachedUpdater;
  }

  throw new Error(
    'electron-updater no exports a usable updater class.',
  );
}

export function configureAutoUpdater():
  void {
  if (
    !app.isPackaged
  ) {
    logger.info(
      'Skipping auto-updater in dev mode.',
    );

    return;
  }

  try {
    const updater =
      resolveUpdater();

    updater.logger =
      logger;

    updater.autoDownload =
      false;

    updater.autoInstallOnAppQuit =
      true;

    updater.on(
      'update-available',
      (
        info: {
          version:
            string;
        },
      ) => {
        logger.info(
          {
            version:
              info
                .version,
          },
          'Nueva versión disponible.',
        );
      },
    );

    updater.on(
      'update-not-available',
      (
        info: {
          version:
            string;
        },
      ) => {
        logger.info(
          {
            version:
              info
                .version,
          },
          'App al día.',
        );
      },
    );

    updater.on(
      'download-progress',
      (
        progress: {
          percent:
            number;
          transferred:
            number;
          total:
            number;
        },
      ) => {
        logger.info(
          {
            percent:
              Math.round(
                progress
                  .percent,
              ),
            transferred:
              progress
                .transferred,
            total:
              progress
                .total,
          },
          'Descargando actualización.',
        );
      },
    );

    updater.on(
      'update-downloaded',
      (
        info: {
          version:
            string;
        },
      ) => {
        logger.info(
          {
            version:
              info
                .version,
          },
          'Actualización descargada. Se instalará al salir.',
        );
      },
    );

    updater.on(
      'error',
      (
        error: Error,
      ) => {
        logger.error(
          {
            message:
              error
                .message,
          },
          'Error al comprobar actualizaciones.',
        );
      },
    );

    setTimeout(
      () => {
        void Promise
          .resolve(
            updater.checkForUpdates(),
          )
          .catch(
            (
              error: Error,
            ) => {
              logger.error(
                {
                  message:
                    error
                      .message,
                },
                'checkForUpdates() rechazado.',
              );
            },
          );
      },
      5_000,
    );
  } catch (
    error: unknown
  ) {
    logger.error(
      {
        message:
          error instanceof Error
            ? error.message
            : String(
                error,
              ),
      },
      'Auto-updater disabled: failed to resolve electron-updater.',
    );
  }
}
