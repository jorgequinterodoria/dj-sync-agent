import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { readInitialSession } from './initial-session.js';

const execFileAsync = promisify(execFile);

export interface InitialBackfillGuardOptions {
  sessionPath: string;
  action: 'start' | 'resume';
  confirmation: string;
  serviceLabel?: string;
}

export interface InitialBackfillGuardResult {
  action: 'start' | 'resume';
  existingSession: {
    sessionId: string;
    status: string;
    runs: number;
    batchesProcessed: number;
    processed: number;
  } | null;
}

async function isWatchRunning(
  label: string,
): Promise<boolean> {
  const uid =
    process.getuid?.() ?? 0;

  try {
    const { stdout } =
      await execFileAsync(
        'launchctl',
        [
          'print',
          `gui/${uid}/${label}`,
        ],
      );

    return (
      /state = running/.test(stdout) ||
      /pid = \d+/.test(stdout)
    );
  } catch {
    return false;
  }
}

export async function assertInitialBackfillAllowed(
  options: InitialBackfillGuardOptions,
): Promise<InitialBackfillGuardResult> {
  if (
    options.confirmation !==
    'YES'
  ) {
    throw new Error(
      'Initial backfill is protected. Set SYNC_INITIAL_CONFIRM=YES before starting or resuming it.',
    );
  }

  const label =
    options.serviceLabel ??
    'com.dj-sync-agent.sync-watch';

  if (
    await isWatchRunning(label)
  ) {
    throw new Error(
      `Refusing initial backfill because LaunchAgent ${label} is running. Stop it first with: launchctl bootout gui/$(id -u)/${label}`,
    );
  }

  const existing =
    await readInitialSession(
      options.sessionPath,
    );

  if (
    options.action === 'resume'
  ) {
    if (!existing) {
      throw new Error(
        'SYNC_INITIAL_ACTION=resume was requested, but no initial-backfill session exists.',
      );
    }

    if (
      existing.mode !==
      'initial-backfill'
    ) {
      throw new Error(
        `Cannot resume session with mode ${existing.mode}.`,
      );
    }

    if (
      existing.status ===
      'completed'
    ) {
      throw new Error(
        'The existing initial-backfill session is already completed.',
      );
    }

    if (
      existing.status ===
      'failed'
    ) {
      throw new Error(
        'The existing initial-backfill session is failed. Inspect lastError before resuming.',
      );
    }
  }

  if (
    options.action === 'start' &&
    existing &&
    (
      existing.status === 'running' ||
      existing.status === 'paused'
    )
  ) {
    throw new Error(
      `An active initial-backfill session already exists (${existing.sessionId}, status=${existing.status}). Use SYNC_INITIAL_ACTION=resume.`,
    );
  }

  return {
    action: options.action,
    existingSession: existing
      ? {
          sessionId:
            existing.sessionId,
          status:
            existing.status,
          runs:
            existing.runs,
          batchesProcessed:
            existing.batchesProcessed,
          processed:
            existing.processed,
        }
      : null,
  };
}
