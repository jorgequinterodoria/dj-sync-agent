import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { SyncEnvelope } from './sync-envelope.js';

export interface SyncServerAck {
  schemaVersion: 1;
  accepted: boolean;
  duplicate: boolean;
  idempotencyKey: string;
  messageId: string;
  receivedAt: string;
  cursor: SyncEnvelope['cursor'];
}

export interface SyncPushOptions {
  url: string;
  apiKey: string;
  agentId: string;
  timeoutMs?: number;
  userAgent?: string;
}

export async function pushSyncEnvelope(
  envelope: SyncEnvelope,
  options: SyncPushOptions,
): Promise<SyncServerAck> {
  const url = new URL(options.url);

  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    throw new Error(
      `Unsupported sync API protocol: ${url.protocol}`,
    );
  }

  if (!options.apiKey) {
    throw new Error(
      'SYNC_API_KEY is required.',
    );
  }

  if (!options.agentId) {
    throw new Error(
      'SYNC_AGENT_ID is required.',
    );
  }

  const body = JSON.stringify(envelope);
  const timeoutMs =
    options.timeoutMs ?? 20_000;

  const userAgent =
    options.userAgent ??
    'dj-sync-agent/0.9.0';

  const headers: Record<string, string> = {
    'content-type':
      'application/json',
    'content-length':
      Buffer.byteLength(
        body,
      ).toString(),
    authorization:
      `Bearer ${options.apiKey}`,
    'x-api-key':
      options.apiKey,
    'x-agent-id':
      options.agentId,
    'x-idempotency-key':
      envelope.message.idempotencyKey,
    'x-sync-message-id':
      envelope.message.id,
    'user-agent':
      userAgent,
  };

  const response =
    await sendRequest(
      url,
      headers,
      body,
      timeoutMs,
    );

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(
        response.body,
      );
  } catch {
    throw new Error(
      `Sync API returned non-JSON response (HTTP ${response.statusCode}).`,
    );
  }

  if (
    response.statusCode < 200 ||
    response.statusCode >= 300
  ) {
    const detail =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed
        ? String(
            (
              parsed as {
                error?: unknown;
              }
            ).error,
          )
        : response.body.slice(
            0,
            500,
          );

    throw new Error(
      `Sync API rejected envelope: HTTP ${response.statusCode}: ${detail}`,
    );
  }

  const ack =
    parsed as Partial<
      SyncServerAck
    >;

  if (
    ack.schemaVersion !== 1 ||
    ack.accepted !== true ||
    typeof ack.duplicate !== 'boolean' ||
    typeof ack.idempotencyKey !== 'string' ||
    typeof ack.messageId !== 'string' ||
    typeof ack.receivedAt !== 'string' ||
    !ack.cursor
  ) {
    throw new Error(
      'Sync API returned an invalid acknowledgement.',
    );
  }

  if (
    ack.idempotencyKey !==
    envelope.message.idempotencyKey
  ) {
    throw new Error(
      'ACK idempotencyKey does not match the pushed envelope.',
    );
  }

  if (
    ack.messageId !==
    envelope.message.id
  ) {
    throw new Error(
      'ACK messageId does not match the pushed envelope.',
    );
  }

  return ack as SyncServerAck;
}

interface HttpResponse {
  statusCode: number;
  headers: Record<
    string,
    string | string[] | undefined
  >;
  body: string;
}

function sendRequest(
  url: URL,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<HttpResponse> {
  const requester =
    url.protocol === 'https:'
      ? httpsRequest
      : httpRequest;

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const req =
        requester(
          {
            method: 'POST',
            hostname:
              url.hostname,
            port:
              url.port ||
              (
                url.protocol ===
                'https:'
                  ? 443
                  : 80
              ),
            path:
              `${url.pathname}${url.search}`,
            headers,
          },
          (res) => {
            const chunks:
              Buffer[] = [];

            res.on(
              'data',
              (
                chunk: Buffer,
              ) => {
                chunks.push(
                  Buffer.isBuffer(
                    chunk,
                  )
                    ? chunk
                    : Buffer.from(
                        chunk,
                      ),
                );
              },
            );

            res.on(
              'end',
              () => {
                resolve({
                  statusCode:
                    res.statusCode ??
                    0,
                  headers:
                    res.headers as Record<
                      string,
                      string |
                        string[] |
                        undefined
                    >,
                  body:
                    Buffer.concat(
                      chunks,
                    ).toString(
                      'utf8',
                    ),
                });
              },
            );
          },
        );

      req.setTimeout(
        timeoutMs,
        () => {
          req.destroy(
            new Error(
              `Sync API request timed out after ${timeoutMs} ms.`,
            ),
          );
        },
      );

      req.on(
        'error',
        reject,
      );

      req.write(body);
      req.end();
    },
  );
}
