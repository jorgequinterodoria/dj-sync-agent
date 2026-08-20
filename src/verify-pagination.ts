import { mkdir, writeFile } from 'node:fs/promises';

import { loadConfig } from './config/env.js';
import { createLogger } from './logger/logger.js';
import {
  close,
  openEncryptedReadOnlyDatabase,
} from './rekordbox/sqlcipher.js';
import { verifyPagination } from './sync/pagination-verifier.js';

function readBatchSize(): number {
  const raw = process.env.CHANGE_BATCH_SIZE ?? '500';
  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > 5000) {
    throw new Error(
      'CHANGE_BATCH_SIZE must be an integer between 1 and 5000.',
    );
  }

  return value;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const batchSize = readBatchSize();

  const db = await openEncryptedReadOnlyDatabase(
    config.rekordboxDbPath,
    config.REKORDBOX_DB_KEY?.trim() || undefined,
    config.REKORDBOX_CIPHER_COMPATIBILITY,
  );

  try {
    const outputDir = new URL('../reports/', import.meta.url);
    await mkdir(outputDir, { recursive: true });

    logger.info(
      { batchSize },
      'Starting full Rekordbox pagination verification',
    );

    const report = await verifyPagination(db, batchSize);

    const outputPath = new URL(
      'rekordbox-pagination-verification.json',
      outputDir,
    );

    await writeFile(
      outputPath,
      JSON.stringify(report, null, 2) + '\n',
      'utf8',
    );

    logger.info(
      {
        rowsProcessed: report.rowsProcessed,
        uniqueIds: report.uniqueIds,
        duplicateIds: report.duplicateIds,
        orderingViolations: report.orderingViolations,
        cursorRegressions: report.cursorRegressions,
        complete: report.complete,
        outputPath: outputPath.pathname,
      },
      'Rekordbox pagination verification completed',
    );

    console.log(
      JSON.stringify(
        {
          ...report,
          outputPath: outputPath.pathname,
        },
        null,
        2,
      ),
    );
  } finally {
    await close(db);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`dj-sync-agent failed: ${message}`);
  process.exitCode = 1;
});
