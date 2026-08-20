import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadConfig } from './config/env.js';
import { createLogger } from './logger/logger.js';
import { close, openEncryptedReadOnlyDatabase } from './rekordbox/sqlcipher.js';
import { inspectSchema } from './rekordbox/schema-inspector.js';
import { analyzeSchema, sampleImportantTables } from './rekordbox/schema-analyzer.js';
import { inspectTrackTables } from './rekordbox/track-inspector.js';
import { verifyRelationships } from './rekordbox/relationship-verifier.js';
import { extractTrackSamples } from './rekordbox/track-extractor.js';
import type { ExtractedTrackSample } from './rekordbox/track-extractor.js';
import { normalizeTrack } from './rekordbox/normalized-track.js';
import { trackHash } from './sync/canonicalizer.js';
import { buildSnapshot, diffSnapshots, readSnapshot, writeSnapshot } from './sync/snapshot-store.js';
import { inspectChangeState } from './sync/change-state.js';
import { scanChangeBatch } from './sync/change-scanner.js';
import { processChangeBatch } from './sync/change-processor.js';
import { verifyPagination } from './sync/pagination-verifier.js';
import { readProcessedChangeBatch, buildSyncEnvelope } from './sync/sync-envelope.js';
import { pushSyncEnvelope } from './sync/sync-client.js';
import { createSyncServer } from './sync/sync-server.js';
import { runSync } from './sync/sync-runner.js';
import type { ChangeCursor } from './sync/change-cursor.js';

const COMMANDS = [
  'inspect','analyze','inspect:tracks','verify:relationships','extract:sample',
  'snapshot:sample','inspect:change-state','scan:changes','sync:batch',
  'verify:pagination','sync:envelope','sync:push','sync:serve','sync:run',
] as const;
type Command = (typeof COMMANDS)[number];

interface PersistedChangeCursor {
  schemaVersion: 1;
  cursor: ChangeCursor | null;
  updatedAt: string;
}

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

function msg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function intEnv(name: string, def: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? String(def));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

async function readCursor(path: string): Promise<ChangeCursor | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<PersistedChangeCursor>;
    if (parsed.schemaVersion !== 1) throw new Error('Unsupported persisted cursor schema version.');
    return parsed.cursor ?? null;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : null;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

async function writeCursor(path: string, cursor: ChangeCursor | null): Promise<void> {
  await writeFile(
    path,
    JSON.stringify({ schemaVersion: 1, cursor, updatedAt: new Date().toISOString() }, null, 2) + '\n',
    'utf8',
  );
}

async function transport(
  command: 'sync:push' | 'sync:serve',
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (command === 'sync:serve') {
    const server = await createSyncServer({
      host: process.env.SYNC_SERVER_HOST ?? '127.0.0.1',
      port: intEnv('SYNC_SERVER_PORT', 8787, 1, 65535),
      apiKey: process.env.SYNC_API_KEY ?? '',
      stateDir:
        process.env.SYNC_SERVER_STATE_DIR ??
        new URL('../reports/sync-server/', import.meta.url).pathname,
    });
    logger.info({ address: server.address() }, 'Sync API server listening');
    await new Promise<void>((resolve, reject) => {
      let stopped = false;
      const shutdown = async () => {
        if (stopped) return;
        stopped = true;
        try {
          await new Promise<void>((r, j) =>
            server.close((error) => (error ? j(error) : r())),
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      process.once('SIGINT', () => void shutdown());
      process.once('SIGTERM', () => void shutdown());
    });
    return;
  }

  const out = new URL('../reports/', import.meta.url);
  const envelopePath = new URL('rekordbox-sync-envelope.json', out).pathname;
  const cursorPath = new URL('rekordbox-change-cursor.json', out).pathname;

  if (!process.env.SYNC_API_KEY) throw new Error('SYNC_API_KEY is required.');
  if (!process.env.SYNC_AGENT_ID) throw new Error('SYNC_AGENT_ID is required.');

  const envelope = JSON.parse(
    await readFile(envelopePath, 'utf8'),
  ) as Awaited<ReturnType<typeof buildSyncEnvelope>>;

  const currentCursor = await readCursor(cursorPath);
  const before = JSON.stringify(currentCursor) === JSON.stringify(envelope.cursor.before);
  const after = JSON.stringify(currentCursor) === JSON.stringify(envelope.cursor.after);

  if (!before && !after) {
    throw new Error(
      'Persisted cursor does not match envelope.cursor.before or envelope.cursor.after. Refusing to push.',
    );
  }

  const ack = await pushSyncEnvelope(envelope, {
    url:
      process.env.SYNC_API_URL ??
      'http://127.0.0.1:8787/v1/sync/batches',
    apiKey: process.env.SYNC_API_KEY,
    agentId: process.env.SYNC_AGENT_ID,
    timeoutMs: intEnv('SYNC_API_TIMEOUT_MS', 20000, 100, 120000),
  });

  if (ack.accepted && envelope.cursor.after && !after) {
    await writeCursor(cursorPath, envelope.cursor.after);
  }

  console.log(JSON.stringify({
    accepted: ack.accepted,
    duplicate: ack.duplicate,
    messageId: ack.messageId,
    idempotencyKey: ack.idempotencyKey,
    cursor: ack.cursor,
    cursorCommitted: envelope.cursor.after !== null,
  }, null, 2));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const raw = process.argv[2] ?? 'inspect';
  if (!isCommand(raw)) throw new Error(`Unknown command: ${raw}`);
  const command = raw;

  logger.info({ command }, 'Starting DJ Sync Agent command');

  if (command === 'sync:push' || command === 'sync:serve') {
    await transport(command, logger);
    return;
  }

  const outputDir = new URL('../reports/', import.meta.url);
  await mkdir(outputDir, { recursive: true });

  if (command === 'sync:run') {
    const db = await openEncryptedReadOnlyDatabase(
      config.rekordboxDbPath,
      config.REKORDBOX_DB_KEY?.trim() || undefined,
      config.REKORDBOX_CIPHER_COMPATIBILITY,
    );

    try {
      const result = await runSync({
        db,
        cursorPath: new URL('rekordbox-change-cursor.json', outputDir).pathname,
        processedBatchPath: new URL('rekordbox-processed-change-batch.json', outputDir).pathname,
        envelopePath: new URL('rekordbox-sync-envelope.json', outputDir).pathname,
        apiUrl:
          process.env.SYNC_API_URL ??
          'http://127.0.0.1:8787/v1/sync/batches',
        apiKey: process.env.SYNC_API_KEY ?? '',
        agentId: process.env.SYNC_AGENT_ID ?? '',
        batchSize: intEnv('CHANGE_BATCH_SIZE', 500, 1, 5000),
        maxBatches: intEnv('SYNC_MAX_BATCHES', 20, 1, 1000),
        timeoutMs: intEnv('SYNC_API_TIMEOUT_MS', 20000, 100, 120000),
        maxRetries: intEnv('SYNC_MAX_RETRIES', 4, 0, 10),
        retryBaseMs: intEnv('SYNC_RETRY_BASE_MS', 1000, 100, 60000),
        logger,
      });

      const resultPath = new URL('rekordbox-sync-run.json', outputDir).pathname;
      await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
      console.log(JSON.stringify({ ...result, outputPath: resultPath }, null, 2));
    } finally {
      await close(db);
    }
    return;
  }

  const db = await openEncryptedReadOnlyDatabase(
    config.rekordboxDbPath,
    config.REKORDBOX_DB_KEY?.trim() || undefined,
    config.REKORDBOX_CIPHER_COMPATIBILITY,
  );

  try {
    switch (command) {
      case 'inspect': {
        const report = await inspectSchema(db, config.rekordboxDbPath);
        const path = new URL('rekordbox-schema.json', outputDir);
        await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ database: report.database, tableCount: report.tableCount, outputPath: path.pathname }, null, 2));
        break;
      }
      case 'analyze': {
        const report = await inspectSchema(db, config.rekordboxDbPath);
        const analysis = await analyzeSchema(db);
        const samples = await sampleImportantTables(db);
        const schemaPath = new URL('rekordbox-schema.json', outputDir);
        const analysisPath = new URL('rekordbox-analysis.json', outputDir);
        const samplesPath = new URL('rekordbox-samples.json', outputDir);
        await writeFile(schemaPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
        await writeFile(analysisPath, JSON.stringify(analysis, null, 2) + '\n', 'utf8');
        await writeFile(samplesPath, JSON.stringify(samples, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ tableCount: analysis.tables.length, foreignKeyCount: analysis.foreignKeyCount, outputs: [schemaPath.pathname, analysisPath.pathname, samplesPath.pathname] }, null, 2));
        break;
      }
      case 'inspect:tracks': {
        const inspection = await inspectTrackTables(db);
        const path = new URL('rekordbox-track-inspection.json', outputDir);
        await writeFile(path, JSON.stringify(inspection, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ schemaVersion: inspection.schemaVersion, generatedAt: inspection.generatedAt, sampleLimit: inspection.sampleLimit, outputPath: path.pathname }, null, 2));
        break;
      }
      case 'verify:relationships': {
        const report = await verifyRelationships(db);
        const path = new URL('rekordbox-relationship-report.json', outputDir);
        await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify(report, null, 2));
        break;
      }
      case 'extract:sample': {
        const limit = intEnv('EXTRACT_SAMPLE_LIMIT', 10, 1, 100);
        const samples = await extractTrackSamples(db, limit);
        const path = new URL('rekordbox-track-samples-v4.json', outputDir);
        const payload = { schemaVersion: 4, generatedAt: new Date().toISOString(), sampleLimit: limit, trackCount: samples.length, tracks: samples };
        await writeFile(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ ...payload, outputPath: path.pathname }, null, 2));
        break;
      }
      case 'snapshot:sample': {
        const limit = intEnv('SNAPSHOT_SAMPLE_LIMIT', Number(process.env.EXTRACT_SAMPLE_LIMIT ?? '10'), 1, 1000);
        const extracted: ExtractedTrackSample[] = await extractTrackSamples(db, limit);
        const entries = extracted.map((raw) => {
          const track = normalizeTrack(raw);
          return { id: track.identity.id, uuid: track.identity.uuid, hash: trackHash(track), updatedAt: track.sync.updatedAt, rbLocalUsn: track.sync.rbLocalUsn, track };
        });
        const snapshotPath = new URL('rekordbox-track-snapshot.json', outputDir).pathname;
        const diffPath = new URL('rekordbox-track-diff.json', outputDir).pathname;
        const previous = await readSnapshot(snapshotPath);
        const current = buildSnapshot(entries);
        const diff = diffSnapshots(previous, current);
        await writeSnapshot(snapshotPath, current);
        await writeFile(diffPath, JSON.stringify({ schemaVersion: 1, generatedAt: current.generatedAt, previousGeneratedAt: previous?.generatedAt ?? null, currentTrackCount: current.trackCount, counts: { added: diff.added.length, updated: diff.updated.length, deleted: diff.deleted.length, unchanged: diff.unchanged.length }, diff }, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ counts: { added: diff.added.length, updated: diff.updated.length, deleted: diff.deleted.length, unchanged: diff.unchanged.length }, snapshotPath, diffPath }, null, 2));
        break;
      }
      case 'inspect:change-state': {
        const report = await inspectChangeState(db);
        const path = new URL('rekordbox-change-state.json', outputDir);
        await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ ...report, outputPath: path.pathname }, null, 2));
        break;
      }
      case 'scan:changes': {
        const batch = await scanChangeBatch(
          db,
          await readCursor(new URL('rekordbox-change-cursor.json', outputDir).pathname),
          intEnv('CHANGE_BATCH_SIZE', 500, 1, 5000),
        );
        const batchPath = new URL('rekordbox-change-batch.json', outputDir).pathname;
        await writeFile(batchPath, JSON.stringify(batch, null, 2) + '\n', 'utf8');
        if (batch.cursorAfter) await writeCursor(new URL('rekordbox-change-cursor.json', outputDir).pathname, batch.cursorAfter);
        console.log(JSON.stringify({ ...batch, outputPath: batchPath }, null, 2));
        break;
      }
      case 'sync:batch': {
        const cursorPath = new URL('rekordbox-change-cursor.json', outputDir).pathname;
        const processedPath = new URL('rekordbox-processed-change-batch.json', outputDir).pathname;
        const processed = await processChangeBatch(db, await readCursor(cursorPath), intEnv('CHANGE_BATCH_SIZE', 500, 1, 5000));
        await writeFile(processedPath, JSON.stringify(processed, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ ...processed, outputs: { processedPath, cursorPath } }, null, 2));
        break;
      }
      case 'verify:pagination': {
        const report = await verifyPagination(db, intEnv('CHANGE_BATCH_SIZE', 500, 1, 5000));
        const path = new URL('rekordbox-pagination-verification.json', outputDir).pathname;
        await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ ...report, outputPath: path }, null, 2));
        break;
      }
      case 'sync:envelope': {
        const processedPath = new URL('rekordbox-processed-change-batch.json', outputDir).pathname;
        const envelopePath = new URL('rekordbox-sync-envelope.json', outputDir).pathname;
        const cursorPath = new URL('rekordbox-change-cursor.json', outputDir).pathname;
        const processed = await readProcessedChangeBatch(processedPath);
        const cursor = await readCursor(cursorPath);
        if (JSON.stringify(cursor) !== JSON.stringify(processed.cursorBefore)) {
          throw new Error('Persisted cursor does not match processed batch cursorBefore. Refusing to build a stale sync envelope.');
        }
        const envelope = buildSyncEnvelope(processed);
        await writeFile(envelopePath, JSON.stringify(envelope, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({ message: envelope.message, cursor: envelope.cursor, counts: envelope.counts, integrity: envelope.integrity, outputPath: envelopePath }, null, 2));
        break;
      }
    }
  } finally {
    await close(db);
    logger.info({ command }, 'Rekordbox database connection closed');
  }
}

main().catch((error: unknown) => {
  console.error(`dj-sync-agent failed: ${msg(error)}`);
  process.exitCode = 1;
});
