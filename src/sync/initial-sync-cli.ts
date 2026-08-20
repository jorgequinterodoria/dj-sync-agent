import { mkdir } from 'node:fs/promises';

import { loadConfig } from '../config/env.js';
import { createLogger } from '../logger/logger.js';
import {
  close,
  openEncryptedReadOnlyDatabase,
} from '../rekordbox/sqlcipher.js';

import {
  runInitialSync,
  type InitialSyncCheckpoint,
} from './initial-sync.js';

import {
  assertInitialBackfillAllowed,
} from './initial-backfill-control.js';

import {
  readInitialSession,
} from './initial-session.js';

function intEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value =
    Number(
      process.env[name] ??
        String(fallback),
    );

  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }

  return value;
}

function actionEnv():
  'start' | 'resume' {
  const raw =
    (
      process.env.SYNC_INITIAL_ACTION ??
      'resume'
    ).toLowerCase();

  if (
    raw !== 'start' &&
    raw !== 'resume'
  ) {
    throw new Error(
      'SYNC_INITIAL_ACTION must be either start or resume.',
    );
  }

  return raw;
}

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

  await mkdir(
    outputDir,
    { recursive: true },
  );

  const sessionPath =
    new URL(
      'rekordbox-sync-session.json',
      outputDir,
    ).pathname;

  const checkpointPath =
    new URL(
      'rekordbox-initial-sync.json',
      outputDir,
    ).pathname;

  const action =
    actionEnv();

  const guard =
    await assertInitialBackfillAllowed({
      sessionPath,
      action,
      confirmation:
        process.env.SYNC_INITIAL_CONFIRM ??
        '',
      serviceLabel:
        'com.dj-sync-agent.sync-watch',
    });

  logger.info(
    {
      action,
      existingSession:
        guard.existingSession,
    },
    'Initial backfill guard passed',
  );

  const db =
    await openEncryptedReadOnlyDatabase(
      config.rekordboxDbPath,
      config.REKORDBOX_DB_KEY?.trim() ||
        undefined,
      config.REKORDBOX_CIPHER_COMPATIBILITY,
    );

  try {
    const checkpoint:
      InitialSyncCheckpoint =
      await runInitialSync({
        db,

        cursorPath:
          new URL(
            'rekordbox-change-cursor.json',
            outputDir,
          ).pathname,

        processedBatchPath:
          new URL(
            'rekordbox-processed-change-batch.json',
            outputDir,
          ).pathname,

        envelopePath:
          new URL(
            'rekordbox-sync-envelope.json',
            outputDir,
          ).pathname,

        checkpointPath,

        statePath:
          new URL(
            'rekordbox-sync-state.json',
            outputDir,
          ).pathname,

        sessionPath,

        apiUrl:
          process.env.SYNC_API_URL ??
          'http://127.0.0.1:8787/v1/sync/batches',

        apiKey:
          process.env.SYNC_API_KEY ??
          '',

        agentId:
          process.env.SYNC_AGENT_ID ??
          '',

        batchSize:
          intEnv(
            'CHANGE_BATCH_SIZE',
            500,
            1,
            5000,
          ),

        maxBatches:
          intEnv(
            'SYNC_INITIAL_MAX_BATCHES',
            10,
            1,
            50,
          ),

        timeoutMs:
          intEnv(
            'SYNC_API_TIMEOUT_MS',
            20000,
            100,
            120000,
          ),

        maxRetries:
          intEnv(
            'SYNC_MAX_RETRIES',
            4,
            0,
            10,
          ),

        retryBaseMs:
          intEnv(
            'SYNC_RETRY_BASE_MS',
            1000,
            100,
            60000,
          ),

        lockPath:
          new URL(
            'dj-sync.lock/',
            outputDir,
          ).pathname,

        logger,
      });

    const session =
      await readInitialSession(
        sessionPath,
      );

    console.log(
      JSON.stringify(
        {
          action,
          checkpoint,
          session,
          checkpointPath,
          sessionPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await close(db);
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
