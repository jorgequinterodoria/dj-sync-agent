import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export type InitialSessionStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export interface InitialSessionCursor {
  rbLocalUsn: number;
  id: string;
}

export interface InitialSessionLastRun {
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number | null;
  batchesProcessed: number;
  scanned: number;
  processed: number;
  completed: boolean | null;
  cursorBefore: InitialSessionCursor | null;
  cursorAfter: InitialSessionCursor | null;
}

export interface InitialSession {
  schemaVersion: 3;
  sessionId: string;
  mode: 'initial-backfill';
  status: InitialSessionStatus;

  startedAt: string;
  updatedAt: string;

  runs: number;
  batchesProcessed: number;
  scanned: number;
  processed: number;

  cursor: InitialSessionCursor | null;

  lastRun: InitialSessionLastRun | null;

  lastError: string | null;
}

interface ReadableLegacySession {
  schemaVersion?: number;
  sessionId?: string;
  mode?: string;
  status?: InitialSessionStatus;
  startedAt?: string;
  updatedAt?: string;
  runs?: number;
  batchesProcessed?: number;
  scanned?: number;
  processed?: number;
  cursor?: InitialSessionCursor | null;
  lastRun?: {
    startedAt?: string | null;
    finishedAt?: string | null;
    elapsedMs?: number | null;
    batchesProcessed?: number;
    scanned?: number;
    processed?: number;
    completed?: boolean | null;
    cursorBefore?: InitialSessionCursor | null;
    cursorAfter?: InitialSessionCursor | null;
  } | null;
  lastError?: string | null;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null
  );
}

function normalizeCursor(
  value: unknown,
): InitialSessionCursor | null {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.rbLocalUsn !== 'number' ||
    !Number.isFinite(
      value.rbLocalUsn,
    ) ||
    typeof value.id !== 'string' ||
    value.id.length === 0
  ) {
    return null;
  }

  return {
    rbLocalUsn:
      value.rbLocalUsn,
    id: value.id,
  };
}

function normalizeLastRun(
  value: unknown,
  fallbackCursor:
    InitialSessionCursor | null,
): InitialSessionLastRun | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    startedAt:
      typeof value.startedAt === 'string'
        ? value.startedAt
        : null,
    finishedAt:
      typeof value.finishedAt === 'string'
        ? value.finishedAt
        : null,
    elapsedMs:
      typeof value.elapsedMs === 'number'
        ? value.elapsedMs
        : null,
    batchesProcessed:
      typeof value.batchesProcessed ===
        'number'
        ? value.batchesProcessed
        : 0,
    scanned:
      typeof value.scanned === 'number'
        ? value.scanned
        : 0,
    processed:
      typeof value.processed === 'number'
        ? value.processed
        : 0,
    completed:
      typeof value.completed === 'boolean'
        ? value.completed
        : null,
    cursorBefore:
      normalizeCursor(
        value.cursorBefore,
      ),
    cursorAfter:
      normalizeCursor(
        value.cursorAfter,
      ) ??
      fallbackCursor,
  };
}

async function readJson(
  path: string,
): Promise<InitialSession | null> {
  try {
    const raw =
      await readFile(
        path,
        'utf8',
      );

    const parsed =
      JSON.parse(
        raw,
      ) as ReadableLegacySession;

    if (
      !isObject(parsed) ||
      typeof parsed.sessionId !==
        'string' ||
      parsed.sessionId.length === 0 ||
      parsed.mode !==
        'initial-backfill'
    ) {
      throw new Error(
        'Invalid sync session file.',
      );
    }

    const cursor =
      normalizeCursor(
        parsed.cursor,
      );

    const status =
      parsed.status === 'running' ||
      parsed.status === 'paused' ||
      parsed.status === 'completed' ||
      parsed.status === 'failed'
        ? parsed.status
        : 'paused';

    return {
      schemaVersion: 3,
      sessionId:
        parsed.sessionId,
      mode:
        'initial-backfill',
      status,
      startedAt:
        typeof parsed.startedAt ===
        'string'
          ? parsed.startedAt
          : new Date().toISOString(),
      updatedAt:
        typeof parsed.updatedAt ===
        'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
      runs:
        typeof parsed.runs ===
        'number'
          ? parsed.runs
          : 0,
      batchesProcessed:
        typeof parsed.batchesProcessed ===
        'number'
          ? parsed.batchesProcessed
          : 0,
      scanned:
        typeof parsed.scanned ===
        'number'
          ? parsed.scanned
          : 0,
      processed:
        typeof parsed.processed ===
        'number'
          ? parsed.processed
          : 0,
      cursor,
      lastRun:
        normalizeLastRun(
          parsed.lastRun,
          cursor,
        ),
      lastError:
        typeof parsed.lastError ===
        'string'
          ? parsed.lastError
          : null,
    };
  } catch (error) {
    const code =
      error &&
      typeof error === 'object' &&
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

export async function readInitialSession(
  path: string,
): Promise<InitialSession | null> {
  const session =
    await readJson(path);

  if (session) {
    /*
     * Persist the normalized schema immediately so every caller
     * from this point forward sees the same session contract.
     */
    await writeInitialSession(
      path,
      session,
    );
  }

  return session;
}

export async function createOrResumeInitialSession(
  path: string,
): Promise<InitialSession> {
  const existing =
    await readInitialSession(
      path,
    );

  if (existing) {
    return existing;
  }

  const now =
    new Date().toISOString();

  const created:
    InitialSession = {
    schemaVersion: 3,
    sessionId:
      randomUUID(),
    mode:
      'initial-backfill',
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
    lastRun: null,
    lastError: null,
  };

  await writeInitialSession(
    path,
    created,
  );

  return created;
}

export async function writeInitialSession(
  path: string,
  session: InitialSession,
): Promise<void> {
  const payload:
    InitialSession = {
    ...session,
    schemaVersion: 3,
    updatedAt:
      new Date().toISOString(),
  };

  const tmp =
    `${path}.tmp`;

  const text =
    JSON.stringify(
      payload,
      null,
      2,
    ) + '\n';

  await writeFile(
    tmp,
    text,
    'utf8',
  );

  await writeFile(
    path,
    text,
    'utf8',
  );
}
