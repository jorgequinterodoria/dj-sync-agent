import {
  createHash,
} from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  validateSyncEnvelope,
  type SyncEnvelope,
} from './sync-envelope.js';

export interface SyncServerOptions {
  host: string;
  port: number;
  apiKey: string;
  stateDir: string;
  maxBodyBytes?: number;
}

export interface SyncServerState {
  schemaVersion: 1;
  processed: Record<
    string,
    {
      messageId: string;
      payloadHash: string;
      receivedAt: string;
      cursor: SyncEnvelope['cursor'];
    }
  >;
}

export async function createSyncServer(
  options: SyncServerOptions,
): Promise<Server> {
  if (!options.apiKey) {
    throw new Error(
      'SYNC_API_KEY is required for the sync server.',
    );
  }

  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65535
  ) {
    throw new Error(
      'SYNC_SERVER_PORT must be between 1 and 65535.',
    );
  }

  await mkdir(
    options.stateDir,
    { recursive: true },
  );

  const statePath = path.join(
    options.stateDir,
    'sync-server-state.json',
  );

  let state =
    await loadState(statePath);

  const maxBodyBytes =
    options.maxBodyBytes ??
    10 * 1024 * 1024;

  const server =
    createServer(
      async (
        req: IncomingMessage,
        res: ServerResponse,
      ) => {
        try {
          await handleRequest(
            req,
            res,
            options,
            statePath,
            state,
            (next) => {
              state = next;
            },
            maxBodyBytes,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          sendJson(
            res,
            500,
            {
              schemaVersion: 1,
              accepted: false,
              error: message,
            },
          );
        }
      },
    );

  await new Promise<void>(
    (resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };

      const onListening = () => {
        server.off('error', onError);
        resolve();
      };

      server.once(
        'error',
        onError,
      );

      server.once(
        'listening',
        onListening,
      );

      server.listen(
        options.port,
        options.host,
      );
    },
  );

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: SyncServerOptions,
  statePath: string,
  state: SyncServerState,
  updateState: (state: SyncServerState) => void,
  maxBodyBytes: number,
): Promise<void> {
  if (
    req.method !== 'POST' ||
    req.url !== '/v1/sync/batches'
  ) {
    sendJson(
      res,
      404,
      {
        schemaVersion: 1,
        error: 'not_found',
      },
    );
    return;
  }

  const authorization =
    getHeader(
      req,
      'authorization',
    );

  const xApiKey =
    getHeader(
      req,
      'x-api-key',
    );

  const providedKey =
    authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : xApiKey;

  if (
    !providedKey ||
    !constantTimeEqual(
      providedKey,
      options.apiKey,
    )
  ) {
    sendJson(
      res,
      401,
      {
        schemaVersion: 1,
        accepted: false,
        error: 'unauthorized',
      },
    );
    return;
  }

  const body =
    await readBody(
      req,
      maxBodyBytes,
    );

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    sendJson(
      res,
      400,
      {
        schemaVersion: 1,
        accepted: false,
        error: 'invalid_json',
      },
    );
    return;
  }

  try {
    validateSyncEnvelope(parsed);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    sendJson(
      res,
      422,
      {
        schemaVersion: 1,
        accepted: false,
        error: 'invalid_envelope',
        detail: message,
      },
    );
    return;
  }

  const envelope =
    parsed as SyncEnvelope;

  const idempotencyKey =
    getHeader(
      req,
      'x-idempotency-key',
    );

  if (
    idempotencyKey !==
    envelope.message.idempotencyKey
  ) {
    sendJson(
      res,
      400,
      {
        schemaVersion: 1,
        accepted: false,
        error: 'idempotency_key_mismatch',
      },
    );
    return;
  }

  const existing =
    state.processed[idempotencyKey];

  if (existing) {
    if (
      existing.messageId !==
        envelope.message.id ||
      existing.payloadHash !==
        envelope.integrity.payloadHash
    ) {
      sendJson(
        res,
        409,
        {
          schemaVersion: 1,
          accepted: false,
          error:
            'idempotency_conflict',
        },
      );
      return;
    }

    sendJson(
      res,
      200,
      {
        schemaVersion: 1,
        accepted: true,
        duplicate: true,
        idempotencyKey,
        messageId:
          envelope.message.id,
        receivedAt:
          existing.receivedAt,
        cursor:
          existing.cursor,
      },
    );

    return;
  }

  const receivedAt =
    new Date().toISOString();

  const nextState: SyncServerState = {
    schemaVersion: 1,
    processed: {
      ...state.processed,
      [idempotencyKey]: {
        messageId:
          envelope.message.id,
        payloadHash:
          envelope.integrity.payloadHash,
        receivedAt,
        cursor:
          envelope.cursor,
      },
    },
  };

  /*
   * This state write is the local server's durable ACK boundary.
   * In V0.9 this will become a database transaction.
   */
  await atomicWriteState(
    statePath,
    nextState,
  );

  updateState(nextState);

  sendJson(
    res,
    200,
    {
      schemaVersion: 1,
      accepted: true,
      duplicate: false,
      idempotencyKey,
      messageId:
        envelope.message.id,
      receivedAt,
      cursor:
        envelope.cursor,
    },
  );
}

async function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;

      req.on('data', (chunk: Buffer) => {
        if (settled) return;

        const buffer =
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);

        total += buffer.length;

        if (total > maxBytes) {
          settled = true;
          reject(
            new Error(
              `Request body exceeds ${maxBytes} bytes.`,
            ),
          );

          req.destroy();
          return;
        }

        chunks.push(buffer);
      });

      req.on('end', () => {
        if (settled) return;

        settled = true;
        resolve(
          Buffer.concat(chunks).toString(
            'utf8',
          ),
        );
      });

      req.on('error', (error) => {
        if (settled) return;

        settled = true;
        reject(error);
      });
    },
  );
}

async function loadState(
  statePath: string,
): Promise<SyncServerState> {
  try {
    const raw =
      await readFile(
        statePath,
        'utf8',
      );

    const parsed =
      JSON.parse(raw) as Partial<SyncServerState>;

    if (
      parsed.schemaVersion !== 1 ||
      parsed.processed === null ||
      typeof parsed.processed !== 'object'
    ) {
      throw new Error(
        'Invalid sync server state.',
      );
    }

    return {
      schemaVersion: 1,
      processed:
        parsed.processed as SyncServerState['processed'],
    };
  } catch (error) {
    const code =
      error &&
      typeof error === 'object' &&
      'code' in error
        ? String(
            (error as { code?: unknown }).code,
          )
        : null;

    if (code === 'ENOENT') {
      return {
        schemaVersion: 1,
        processed: {},
      };
    }

    throw error;
  }
}

async function atomicWriteState(
  filePath: string,
  state: SyncServerState,
): Promise<void> {
  const tempPath =
    `${filePath}.tmp`;

  await writeFile(
    tempPath,
    JSON.stringify(
      state,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  await writeFile(
    filePath,
    JSON.stringify(
      state,
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

function getHeader(
  req: IncomingMessage,
  name: string,
): string | null {
  const value =
    req.headers[
      name.toLowerCase()
    ];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function constantTimeEqual(
  a: string,
  b: string,
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const left =
    createHash('sha256')
      .update(a, 'utf8')
      .digest();

  const right =
    createHash('sha256')
      .update(b, 'utf8')
      .digest();

  let difference = 0;

for (
  let index = 0;
  index < left.length;
  index += 1
) {
  const leftByte = left[index];
  const rightByte = right[index];

  if (
    leftByte === undefined ||
    rightByte === undefined
  ) {
    return false;
  }

  difference |=
    leftByte ^ rightByte;
}

return difference === 0;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload =
    JSON.stringify(body);

  res.statusCode =
    statusCode;

  res.setHeader(
    'content-type',
    'application/json; charset=utf-8',
  );

  res.setHeader(
    'content-length',
    Buffer.byteLength(payload).toString(),
  );

  res.end(payload);
}
