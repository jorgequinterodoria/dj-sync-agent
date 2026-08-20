import { writeFile } from 'node:fs/promises';

import { loadConfig } from '../config/env.js';
import { createLogger } from '../logger/logger.js';
import { buildSyncStatus } from './status.js';

async function main(): Promise<void> {
  const config =
    loadConfig();

  const logger =
    createLogger(
      config,
    );

  const outputDir =
    new URL(
      '../../reports/',
      import.meta.url,
    );

  const apiUrl =
    process.env.SYNC_HEALTH_URL ??
    (
      process.env.SYNC_API_URL ??
      'http://127.0.0.1:8787/v1/sync/batches'
    ).replace(
      /\/sync-batch\/?$/,
      '/sync-health',
    );

  const status =
    await buildSyncStatus({
      serviceLabel:
        'com.dj-sync-agent.sync-watch',

      databasePath:
        config.rekordboxDbPath,

      cursorPath:
        new URL(
          'rekordbox-change-cursor.json',
          outputDir,
        ).pathname,

      statePath:
        new URL(
          'rekordbox-sync-state.json',
          outputDir,
        ).pathname,

      sessionPath:
        new URL(
          'rekordbox-sync-session.json',
          outputDir,
        ).pathname,

      apiUrl,

      apiKey:
        process.env.SYNC_API_KEY ??
        '',
    });

  const statusPath =
    new URL(
      'rekordbox-sync-status.json',
      outputDir,
    ).pathname;

  await writeFile(
    statusPath,
    JSON.stringify(
      status,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  logger.info(
    {
      statusPath,
      serviceState:
        status.service.state,
      syncMode:
        status.sync.mode,
      syncStatus:
        status.sync.status,
      sessionId:
        status.sync.sessionId,
      serverHealthy:
        status.server.healthy,
      cursor:
        status.sync.cursor,
    },
    'Sync status generated',
  );

  console.log(
    JSON.stringify(
      {
        ...status,
        outputPath:
          statusPath,
      },
      null,
      2,
    ),
  );

  if (
    status.service.state !==
      'running' ||
    !status.database.exists ||
    !status.server.healthy ||
    status.sync.status ===
      'failed'
  ) {
    process.exitCode = 2;
  }
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
