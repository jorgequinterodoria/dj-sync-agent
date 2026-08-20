import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export type SyncSessionMode =
  | 'initial-backfill'
  | 'watch';

export type SyncSessionStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export interface SyncSessionCursor {
  rbLocalUsn: number;
  id: string;
}

export interface SyncSession {
  schemaVersion: 1;
  sessionId: string;
  mode: SyncSessionMode;
  status: SyncSessionStatus;

  startedAt: string;
  updatedAt: string;

  runs: number;
  batchesProcessed: number;
  scanned: number;
  processed: number;

  cursor: SyncSessionCursor | null;

  lastRun: {
    startedAt: string | null;
    finishedAt: string | null;
    elapsedMs: number | null;
    batchesProcessed: number;
    scanned: number;
    processed: number;
    completed: boolean | null;
  };

  lastError: string | null;
}

export interface CreateOrResumeSessionOptions {
  path: string;
  mode: SyncSessionMode;
}

async function readSession(
  path: string,
): Promise<SyncSession | null> {
  try {
    const raw =
      await readFile(
        path,
        'utf8',
      );

    const session =
      JSON.parse(
        raw,
      ) as SyncSession;

    if (
      session.schemaVersion !== 1 ||
      typeof session.sessionId !==
        'string' ||
      (
        session.mode !==
          'initial-backfill' &&
        session.mode !==
          'watch'
      )
    ) {
      throw new Error(
        'Invalid sync session file.',
      );
    }

    return session;
  } catch (error) {
    const code =
      error &&
      typeof error ===
        'object' &&
      'code' in error
        ? String(
            (
              error as {
                code?: unknown;
              }
            ).code,
          )
        : null;

    if (code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function createOrResumeSession(
  options: CreateOrResumeSessionOptions,
): Promise<SyncSession> {
  const existing =
    await readSession(
      options.path,
    );

  if (
    existing &&
    existing.mode ===
      options.mode &&
    (
      existing.status ===
        'running' ||
      existing.status ===
        'paused'
    )
  ) {
    return existing;
  }

  const now =
    new Date().toISOString();

  const session: SyncSession = {
    schemaVersion: 1,
    sessionId:
      randomUUID(),
    mode:
      options.mode,
    status:
      'running',
    startedAt:
      now,
    updatedAt:
      now,
    runs: 0,
    batchesProcessed: 0,
    scanned: 0,
    processed: 0,
    cursor: null,
    lastRun: {
      startedAt: null,
      finishedAt: null,
      elapsedMs: null,
      batchesProcessed: 0,
      scanned: 0,
      processed: 0,
      completed: null,
    },
    lastError: null,
  };

  await writeSyncSession(
    options.path,
    session,
  );

  return session;
}

export async function writeSyncSession(
  path: string,
  session: SyncSession,
): Promise<void> {
  const payload: SyncSession = {
    ...session,
    updatedAt:
      new Date().toISOString(),
  };

  const temporaryPath =
    `${path}.tmp`;

  const text =
    JSON.stringify(
      payload,
      null,
      2,
    ) + '\n';

  await writeFile(
    temporaryPath,
    text,
    'utf8',
  );

  await writeFile(
    path,
    text,
    'utf8',
  );
}

export async function readSyncSessionFile(
  path: string,
): Promise<SyncSession | null> {
  return readSession(path);
}
