import { mkdir, open } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';

import {
  countActiveTracks,
  extractTrackSamplesPage,
  type ExtractedTrackSample,
} from '../rekordbox/track-extractor.js';
import {
  close,
  openEncryptedReadOnlyDatabase,
} from '../rekordbox/sqlcipher.js';
import { loadConfig } from '../config/env.js';
import { normalizeTrack } from '../rekordbox/normalized-track.js';
import { trackHash } from './canonicalizer.js';

type SnapshotItem = {
  id: string;
  uuid: string | null;
  hash: string;
  updatedAt: string | null;
  rbLocalUsn: number | null;
  track: ReturnType<typeof normalizeTrack>;
};

function intEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(
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

function toSnapshotItem(
  raw: ExtractedTrackSample,
): SnapshotItem {
  const track =
    normalizeTrack(raw);

  return {
    id: track.identity.id,
    uuid: track.identity.uuid,
    hash: trackHash(track),
    updatedAt:
      track.sync.updatedAt,
    rbLocalUsn:
      track.sync.rbLocalUsn,
    track,
  };
}

type BuildState = {
  schemaVersion: 1;
  expectedCount: number;
  processed: number;
  pages: number;
  lastId: string | null;
  completed: boolean;
  outputPath: string;
  startedAt: string;
  updatedAt: string;
  error: string | null;
};

async function main(): Promise<void> {
  const config =
    loadConfig();

  const pageSize =
    intEnv(
      'SNAPSHOT_PAGE_SIZE',
      100,
      1,
      500,
    );

  const maxPages =
    intEnv(
      'SNAPSHOT_MAX_PAGES',
      10000,
      1,
      10000,
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

  const outputPath =
    process.env.SNAPSHOT_NDJSON_PATH ??
    new URL(
      'rekordbox-track-snapshot.ndjson',
      outputDir,
    ).pathname;

  const statePath =
    process.env.SNAPSHOT_BUILD_STATE_PATH ??
    new URL(
      'rekordbox-snapshot-build-state.json',
      outputDir,
    ).pathname;

  const db =
    await openEncryptedReadOnlyDatabase(
      config.rekordboxDbPath,
      config.REKORDBOX_DB_KEY?.trim() ||
        undefined,
      config.REKORDBOX_CIPHER_COMPATIBILITY,
    );

  try {
    const expectedCount =
      await countActiveTracks(
        db,
      );

    let state:
      BuildState;

    try {
      state =
        JSON.parse(
          await readFile(
            statePath,
            'utf8',
          ),
        ) as BuildState;
    } catch {
      state = {
        schemaVersion: 1,
        expectedCount,
        processed: 0,
        pages: 0,
        lastId: null,
        completed: false,
        outputPath,
        startedAt:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString(),
        error: null,
      };
    }

    if (
      state.expectedCount !==
      expectedCount
    ) {
      throw new Error(
        `Active track count changed. Existing=${state.expectedCount}, current=${expectedCount}. Remove or archive the existing snapshot-build state before starting a new snapshot.`,
      );
    }

    if (state.completed) {
      console.log(
        JSON.stringify(
          state,
          null,
          2,
        ),
      );
      return;
    }

    /*
     * Resume safely:
     * - if starting from zero, create/truncate the output;
     * - if resuming, append after the persisted lastId.
     */
    const file =
      await open(
        outputPath,
        state.processed === 0
          ? 'w'
          : 'a',
      );

    try {
      for (
        let page = 0;
        page < maxPages;
        page += 1
      ) {
        const rows =
          await extractTrackSamplesPage(
            db,
            state.lastId,
            pageSize,
          );

        if (rows.length === 0) {
          break;
        }

        const lines =
          rows.map(
            (raw) =>
              JSON.stringify(
                toSnapshotItem(raw),
              ) + '\n',
          );

        await file.write(
          lines.join(''),
        );

        state.processed +=
          rows.length;

        state.pages += 1;

        state.lastId =
          rows.at(-1)?.id ??
          state.lastId;

        state.updatedAt =
          new Date().toISOString();

        state.error = null;

        await writeFile(
          statePath,
          JSON.stringify(
            state,
            null,
            2,
          ) + '\n',
          'utf8',
        );

        console.log(
          JSON.stringify({
            page:
              state.pages,
            pageRows:
              rows.length,
            processed:
              state.processed,
            expectedCount:
              state.expectedCount,
            lastId:
              state.lastId,
          }),
        );

        if (
          rows.length <
          pageSize
        ) {
          break;
        }
      }
    } finally {
      await file.close();
    }

    if (
      state.processed ===
        state.expectedCount
    ) {
      state.completed =
        true;
    } else if (
      state.processed >
      state.expectedCount
    ) {
      throw new Error(
        `Snapshot produced more tracks than expected: processed=${state.processed}, expected=${state.expectedCount}.`,
      );
    }

    state.updatedAt =
      new Date().toISOString();

    state.error = null;

    await writeFile(
      statePath,
      JSON.stringify(
        state,
        null,
        2,
      ) + '\n',
      'utf8',
    );

    console.log(
      JSON.stringify(
        state,
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      `snapshot-build failed: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );

    process.exitCode = 1;
  } finally {
    await close(db);
  }
}

main().catch(
  (error: unknown) => {
    console.error(
      `snapshot-build failed: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );

    process.exitCode = 1;
  },
);
