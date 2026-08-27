import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadConfig } from '../config/env.js';
import { buildSyncStatus } from '../sync/status.js';

const execFileAsync = promisify(
  execFile,
);

const SERVICE_LABEL =
  'com.dj-sync-agent.sync-watch';

const SERVICE_ENV_PATH =
  `${process.env.HOME ?? ''}/.config/dj-sync-agent/sync-watch.env`;

const SERVICE_PLIST_PATH =
  `${process.env.HOME ?? ''}/Library/LaunchAgents/${SERVICE_LABEL}.plist`;

const STATUS_POLL_INTERVAL_MS = 500;
const STATUS_POLL_TIMEOUT_MS = 5000;

type SyncStatus = Awaited<
  ReturnType<typeof buildSyncStatus>
>;

export interface DJSyncService {
  status(): Promise<SyncStatus>;
  start(): Promise<SyncStatus>;
  stop(): Promise<SyncStatus>;
  restart(): Promise<SyncStatus>;
}

function shellQuote(
  value: string,
): string {
  return `'${value.replaceAll(
    "'",
    "'\\''",
  )}'`;
}

export async function readServiceEnvironment(): Promise<{
  apiUrl?: string;
  apiKey?: string;
  agentId?: string;
}> {
  try {
    await access(
      SERVICE_ENV_PATH,
    );
  } catch {
    return {};
  }

  const script = [
    'set -a',
    `source ${shellQuote(SERVICE_ENV_PATH)}`,
    'set +a',
    'printf "%s\\0%s\\0%s\\0" "$SYNC_API_URL" "$SYNC_API_KEY" "$SYNC_AGENT_ID"',
  ].join('\n');

  try {
    const { stdout } =
      await execFileAsync(
        '/bin/zsh',
        ['-lc', script],
        {
          maxBuffer:
            1024 * 1024,
        },
      );

    const parts =
      stdout.split('\0');

    const apiUrl =
      parts[0]?.trim();

    const apiKey =
      parts[1]?.trim();

    const agentId =
      parts[2]?.trim();

    return {
      ...(apiUrl
        ? { apiUrl }
        : {}),
      ...(apiKey
        ? { apiKey }
        : {}),
      ...(agentId
        ? { agentId }
        : {}),
    };
  } catch {
    return {};
  }
}

async function buildStatus(): Promise<SyncStatus> {
  const config =
    loadConfig();

  const serviceEnvironment =
    await readServiceEnvironment();

  const outputDir =
    new URL(
      '../../reports/',
      import.meta.url,
    );

  const apiUrl =
    process.env.SYNC_HEALTH_URL ??
    serviceEnvironment.apiUrl ??
    process.env.SYNC_API_URL ??
    'http://127.0.0.1:8787/v1/sync/batches';

  const apiKey =
    process.env.SYNC_API_KEY ??
    serviceEnvironment.apiKey ??
    '';

  return buildSyncStatus({
    serviceLabel:
      SERVICE_LABEL,

    databasePath:
      config.rekordboxDbPath,

    cursorPath:
      new URL(
        'rekordbox-change-cursor.json',
        outputDir,
      ).pathname,

    statePath:
      new URL(
        'rekordbox-sync-state.json',
        outputDir,
      ).pathname,

    sessionPath:
      new URL(
        'rekordbox-sync-session.json',
        outputDir,
      ).pathname,

    apiUrl:
      apiUrl.replace(
        /\/sync-batch\/?$/,
        '/sync-health',
      ),

    apiKey,
  });
}

async function runLaunchctl(
  action:
    | 'bootstrap'
    | 'bootout'
    | 'kickstart',
): Promise<void> {
  const uid =
    process.getuid?.() ?? 0;

  const guiDomain =
    `gui/${uid}`;

  if (
    action === 'bootstrap'
  ) {
    await execFileAsync(
      'launchctl',
      [
        'bootstrap',
        guiDomain,
        SERVICE_PLIST_PATH,
      ],
    );

    return;
  }

  if (
    action === 'bootout'
  ) {
    await execFileAsync(
      'launchctl',
      [
        'bootout',
        `${guiDomain}/${SERVICE_LABEL}`,
      ],
    );

    return;
  }

  await execFileAsync(
    'launchctl',
    [
      'kickstart',
      '-k',
      `${guiDomain}/${SERVICE_LABEL}`,
    ],
  );
}

async function ensureInstalled(): Promise<void> {
  try {
    await access(
      SERVICE_PLIST_PATH,
    );
  } catch {
    throw new Error(
      [
        'DJ Sync service is not installed.',
        'Run ./scripts/install-sync-service.sh first.',
      ].join(' '),
    );
  }
}

async function waitFor(
  predicate: (
    status: SyncStatus,
  ) => boolean,
): Promise<SyncStatus> {
  const deadline =
    Date.now() +
    STATUS_POLL_TIMEOUT_MS;

  let current =
    await buildStatus();

  while (
    Date.now() < deadline
  ) {
    if (
      predicate(current)
    ) {
      return current;
    }

    await new Promise<void>(
      (resolve) => {
        setTimeout(
          resolve,
          STATUS_POLL_INTERVAL_MS,
        );
      },
    );

    current =
      await buildStatus();
  }

  return current;
}

export function createDJSyncService(): DJSyncService {
  return {
    async status(): Promise<SyncStatus> {
      return buildStatus();
    },

    async start(): Promise<SyncStatus> {
      await ensureInstalled();

      const current =
        await buildStatus();

      if (
        current.service.state ===
        'running'
      ) {
        return current;
      }

      if (
        current.service.loaded
      ) {
        await runLaunchctl(
          'kickstart',
        );
      } else {
        await runLaunchctl(
          'bootstrap',
        );

        await runLaunchctl(
          'kickstart',
        );
      }

      return waitFor(
        (status) =>
          status.service.state ===
          'running',
      );
    },

    async stop(): Promise<SyncStatus> {
      const current =
        await buildStatus();

      if (
        !current.service.loaded
      ) {
        return current;
      }

      try {
        await runLaunchctl(
          'bootout',
        );
      } catch {
        // The service may already have
        // stopped between status() and bootout.
      }

      return waitFor(
        (status) =>
          status.service.state !==
          'running',
      );
    },

    async restart(): Promise<SyncStatus> {
      await ensureInstalled();

      const current =
        await buildStatus();

      if (
        current.service.loaded
      ) {
        try {
          await runLaunchctl(
            'bootout',
          );
        } catch {
          // Continue with bootstrap.
        }
      }

      await runLaunchctl(
        'bootstrap',
      );

      await runLaunchctl(
        'kickstart',
      );

      return waitFor(
        (status) =>
          status.service.state ===
          'running',
      );
    },
  };
}