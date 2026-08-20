import { loadConfig } from './config/env.js';
import { createLogger } from './logger/logger.js';
import { validateEnvelopeFile } from './sync/envelope-validator.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const envelopePath =
    process.env.SYNC_ENVELOPE_PATH ??
    new URL(
      '../reports/rekordbox-sync-envelope.json',
      import.meta.url,
    ).pathname;

  logger.info(
    { envelopePath },
    'Starting sync envelope validation',
  );

  const report =
    await validateEnvelopeFile(
      envelopePath,
    );

  console.log(
    JSON.stringify(
      {
        ...report,
        envelopePath,
      },
      null,
      2,
    ),
  );

  if (!report.valid) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `dj-sync-agent failed: ${message}`,
  );

  process.exitCode = 1;
});
