import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

type SnapshotTrack = {
  id: string;
  uuid: string | null;
  hash: string;
  updatedAt: string | null;
  rbLocalUsn: number | null;
  track: Record<string, unknown>;
};

type SnapshotState = {
  schemaVersion: 2;
  sessionId: string;
  expectedCount: number;
  sentCount: number;
  batchSize: number;
  status:
    | 'staging'
    | 'committed'
    | 'failed';
  startedAt: string;
  updatedAt: string;
  lastError: string | null;
};

function required(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return value;
}

function integerEnv(
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

async function sha256Hex(
  input: string,
): Promise<string> {
  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        input,
      ),
    );

  return Array.from(
    new Uint8Array(digest),
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(
          2,
          '0',
        ),
    )
    .join('');
}

function canonicalize(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value !== null &&
    typeof value ===
      'object'
  ) {
    const object =
      value as Record<
        string,
        unknown
      >;

    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map(
          (key) => [
            key,
            canonicalize(
              object[key],
            ),
          ],
        ),
    );
  }

  return value;
}

function canonicalJson(
  value: unknown,
): string {
  return JSON.stringify(
    canonicalize(value),
  );
}

async function post(
  url: string,
  apiKey: string,
  agentId: string,
  body: Record<string, unknown>,
  extraHeaders:
    Record<string, string> = {},
): Promise<any> {
  const payload =
    canonicalJson(body);

  const response =
    await fetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
          'x-api-key':
            apiKey,
          'x-agent-id':
            agentId,
          ...extraHeaders,
        },
        body: payload,
      },
    );

  const data =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Snapshot request failed (${response.status}): ${JSON.stringify(data)}`,
    );
  }

  return data;
}

async function readSnapshotHeader(
  snapshotPath: string,
): Promise<{
  expectedCount: number;
}> {
  const stream =
    createReadStream(
      snapshotPath,
      {
        encoding: 'utf8',
      },
    );

  const reader =
    createInterface({
      input: stream,
      crlfDelay:
        Infinity,
    });

  try {
    for await (
      const line of reader
    ) {
      if (!line.trim()) {
        continue;
      }

      const first =
        JSON.parse(
          line,
        ) as Record<
          string,
          unknown
        >;

      if (
        typeof first.expectedCount ===
        'number'
      ) {
        return {
          expectedCount:
            first.expectedCount,
        };
      }

      /*
       * V1.0.1 snapshot files store the
       * expected count in the build-state
       * file, not as a data record.
       */
      break;
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  throw new Error(
    'Snapshot header not found.',
  );
}

async function main(): Promise<void> {
  const apiUrl =
    required(
      'SYNC_SNAPSHOT_URL',
    );

  const apiKey =
    required(
      'SYNC_API_KEY',
    );

  const agentId =
    required(
      'SYNC_AGENT_ID',
    );

  const snapshotPath =
    required(
      'SYNC_SNAPSHOT_PATH',
    );

  const statePath =
    process.env
      .SYNC_SNAPSHOT_STATE_PATH ??
    'reports/rekordbox-snapshot-sync.json';

  const buildStatePath =
    process.env
      .SNAPSHOT_BUILD_STATE_PATH ??
    'reports/rekordbox-snapshot-build-state.json';

  const batchSize =
    integerEnv(
      'SYNC_SNAPSHOT_BATCH_SIZE',
      250,
      1,
      1000,
    );

  const buildState =
    JSON.parse(
      await readFile(
        buildStatePath,
        'utf8',
      ),
    ) as {
      expectedCount: number;
      processed: number;
      completed: boolean;
    };

  if (
    !buildState.completed ||
    buildState.processed !==
      buildState.expectedCount
  ) {
    throw new Error(
      `Snapshot build is incomplete. processed=${buildState.processed}, expected=${buildState.expectedCount}.`,
    );
  }

  const expectedCount =
    buildState.expectedCount;

  let state:
    SnapshotState;

  try {
    state =
      JSON.parse(
        await readFile(
          statePath,
          'utf8',
        ),
      ) as SnapshotState;

    if (
      state.schemaVersion !== 2
    ) {
      throw new Error(
        'Unsupported snapshot sync state schema.',
      );
    }
  } catch {
    state = {
      schemaVersion: 2,
      sessionId:
        randomUUID(),
      expectedCount,
      sentCount: 0,
      batchSize,
      status: 'staging',
      startedAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString(),
      lastError: null,
    };
  }

  if (
    state.expectedCount !==
    expectedCount
  ) {
    throw new Error(
      `Snapshot count changed. Existing=${state.expectedCount}, current=${expectedCount}.`,
    );
  }

  if (
    state.status ===
    'committed'
  ) {
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
   * Rebuild the batches from the NDJSON file and
   * skip the already-acknowledged prefix.
   * This keeps the remote side idempotent even after
   * a local interruption.
   */
  let rowIndex = 0;
  let batch: SnapshotTrack[] =
    [];

  state.status =
    'staging';
  state.lastError =
    null;

  try {
    const stream =
      createReadStream(
        snapshotPath,
        {
          encoding:
            'utf8',
        },
      );

    const reader =
      createInterface({
        input: stream,
        crlfDelay:
          Infinity,
      });

    for await (
      const line of reader
    ) {
      if (!line.trim()) {
        continue;
      }

      const track =
        JSON.parse(
          line,
        ) as SnapshotTrack;

      /*
       * The first version of the builder writes only track
       * records, so every line is a track.
       */
      if (
        rowIndex <
        state.sentCount
      ) {
        rowIndex += 1;
        continue;
      }

      batch.push(track);
      rowIndex += 1;

      if (
        batch.length >=
        state.batchSize
      ) {
        const data =
          await post(
            apiUrl,
            apiKey,
            agentId,
            {
              schemaVersion: 1,
              mode: 'snapshot',
              sessionId:
                state.sessionId,
              expectedCount,
              tracks: batch,
            },
          );

        state.sentCount =
          rowIndex;
        state.updatedAt =
          new Date().toISOString();

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
            sentCount:
              state.sentCount,
            expectedCount,
            status:
              data?.status ??
              'staging',
          }),
        );

        batch = [];
      }
    }

    if (
      batch.length > 0
    ) {
      const data =
        await post(
          apiUrl,
          apiKey,
          agentId,
          {
            schemaVersion: 1,
            mode: 'snapshot',
            sessionId:
              state.sessionId,
            expectedCount,
            tracks: batch,
          },
        );

      state.sentCount =
        rowIndex;
      state.updatedAt =
        new Date().toISOString();

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
          sentCount:
            state.sentCount,
          expectedCount,
          status:
            data?.status ??
            'staging',
        }),
      );
    }

    if (
      state.sentCount !==
      expectedCount
    ) {
      throw new Error(
        `Remote staging is incomplete. sent=${state.sentCount}, expected=${expectedCount}.`,
      );
    }

    const commitBody =
      await post(
        apiUrl,
        apiKey,
        agentId,
        {
          schemaVersion: 1,
          mode:
            'snapshot:commit',
          sessionId:
            state.sessionId,
        },
        {
          'x-snapshot-action':
            'commit',
        },
      );

    state.status =
      'committed';
    state.updatedAt =
      new Date().toISOString();

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
        {
          ...state,
          server:
            commitBody,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    state.status =
      'failed';
    state.lastError =
      error instanceof Error
        ? error.message
        : String(error);
    state.updatedAt =
      new Date().toISOString();

    await writeFile(
      statePath,
      JSON.stringify(
        state,
        null,
        2,
      ) + '\n',
      'utf8',
    );

    throw error;
  }
}

main().catch(
  (error: unknown) => {
    console.error(
      `snapshot-sync failed: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );

    process.exitCode = 1;
  },
);
