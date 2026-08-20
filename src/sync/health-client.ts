import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface SyncHealthResult {
  ok: boolean;
  service: string;
  version: string;
  checkedAt: string;
  region: string | null;
  deploymentId: string | null;
}

export async function checkSyncHealth(options: {
  url: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<SyncHealthResult> {
  const url = new URL(options.url);

  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    throw new Error(
      `Unsupported health API protocol: ${url.protocol}`,
    );
  }

  if (!options.apiKey) {
    throw new Error(
      'SYNC_API_KEY is required for health check.',
    );
  }

  const response =
    await requestJson(
      url,
      options.apiKey,
      options.timeoutMs ?? 10000,
    );

  let payload: unknown;

  try {
    payload =
      JSON.parse(response.body);
  } catch {
    throw new Error(
      `Health endpoint returned non-JSON response (HTTP ${response.statusCode}).`,
    );
  }

  if (
    response.statusCode < 200 ||
    response.statusCode >= 300
  ) {
    const detail =
      payload &&
      typeof payload === 'object' &&
      'error' in payload
        ? String(
            (
              payload as {
                error?: unknown;
              }
            ).error,
          )
        : response.body.slice(0, 500);

    throw new Error(
      `Health endpoint rejected request: HTTP ${response.statusCode}: ${detail}`,
    );
  }

  const result =
    payload as Partial<SyncHealthResult>;

  if (
    result.ok !== true ||
    result.service !== 'dj-sync-api' ||
    typeof result.version !== 'string' ||
    typeof result.checkedAt !== 'string'
  ) {
    throw new Error(
      'Health endpoint returned an invalid payload.',
    );
  }

  return {
    ok: true,
    service: result.service,
    version: result.version,
    checkedAt: result.checkedAt,
    region:
      result.region ?? null,
    deploymentId:
      result.deploymentId ?? null,
  };
}

interface ResponseData {
  statusCode: number;
  body: string;
}

function requestJson(
  url: URL,
  apiKey: string,
  timeoutMs: number,
): Promise<ResponseData> {
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
            method: 'GET',
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
            headers: {
              'x-api-key':
                apiKey,
              accept:
                'application/json',
              'user-agent':
                'dj-sync-agent/0.9.5',
            },
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
              `Health endpoint request timed out after ${timeoutMs} ms.`,
            ),
          );
        },
      );

      req.on(
        'error',
        reject,
      );

      req.end();
    },
  );
}
