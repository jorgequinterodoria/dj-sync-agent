import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { ChangeCursor } from './change-cursor.js';

export interface ProcessedChangeRecord {
  action: 'add' | 'update' | 'delete';
  id: string;
  uuid: string | null;
  hash: string | null;
  track: unknown | null;
  rbLocalUsn: number | null;
  updatedAt: string | null;
}

export interface ProcessedChangeBatch {
  schemaVersion: number;
  cursorBefore: ChangeCursor | null;
  cursorAfter: ChangeCursor | null;
  hasMore: boolean;
  scanned: number;
  active: number;
  deleted: number;
  processed: number;
  unchanged?: number;
  changes: ProcessedChangeRecord[];
}

export interface SyncEnvelopeSummary {
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

export interface SyncEnvelope {
  schemaVersion: 3;

  message: {
    type: 'rekordbox.sync.batch';
    id: string;
    idempotencyKey: string;
    createdAt: string;
  };

  cursor: {
    before: ChangeCursor | null;
    after: ChangeCursor | null;
    hasMore: boolean;
  };

  counts: {
    scanned: number;
    processed: number;
    changes: SyncEnvelopeSummary;
  };

  changes: {
    added: ProcessedChangeRecord[];
    updated: ProcessedChangeRecord[];
    deleted: ProcessedChangeRecord[];
  };

  integrity: {
    algorithm: 'sha256';
    payloadHash: string;
  };
}

export async function readProcessedChangeBatch(
  filePath: string,
): Promise<ProcessedChangeBatch> {
  const raw = await readFile(filePath, 'utf8');

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    throw new Error(
      `Invalid processed change batch JSON: ${message}`,
    );
  }

  validateProcessedBatch(parsed);
  return parsed;
}

export function buildSyncEnvelope(
  batch: ProcessedChangeBatch,
  createdAt = new Date().toISOString(),
): SyncEnvelope {
  const added = batch.changes.filter(
    (change) => change.action === 'add',
  );

  const updated = batch.changes.filter(
    (change) => change.action === 'update',
  );

  const deleted = batch.changes.filter(
    (change) => change.action === 'delete',
  );

  /*
   * `processed` means candidates that successfully passed through
   * the local processing pipeline. Some processed active candidates
   * can be unchanged and therefore intentionally absent from
   * added/updated/deleted arrays.
   */
  const changedCount =
    added.length +
    updated.length +
    deleted.length;

  const unchanged =
    batch.unchanged ??
    Math.max(
      0,
      batch.processed - changedCount,
    );

  if (
    changedCount + unchanged !==
    batch.processed
  ) {
    throw new Error(
      'Processed batch is internally inconsistent: ' +
        'changes + unchanged must equal processed.',
    );
  }

  const semanticPayload = {
    schemaVersion: 3 as const,

    type: 'rekordbox.sync.batch' as const,

    cursor: {
      before: batch.cursorBefore,
      after: batch.cursorAfter,
      hasMore: batch.hasMore,
    },

    counts: {
      scanned: batch.scanned,
      processed: batch.processed,
      changes: {
        added: added.length,
        updated: updated.length,
        deleted: deleted.length,
        unchanged,
      },
    },

    changes: {
      added,
      updated,
      deleted,
    },
  };

  const payloadHash = sha256(
    canonicalJson(semanticPayload),
  );

  /*
   * The semantic hash is the idempotency identity.
   * It does not include createdAt.
   */
  const messageId = payloadHash.slice(0, 32);

  return {
    schemaVersion: 3,

    message: {
      type: 'rekordbox.sync.batch',
      id: messageId,
      idempotencyKey: payloadHash,
      createdAt,
    },

    cursor: semanticPayload.cursor,

    counts: semanticPayload.counts,

    changes: semanticPayload.changes,

    integrity: {
      algorithm: 'sha256',
      payloadHash,
    },
  };
}

export function canonicalSyncPayload(
  envelope: SyncEnvelope,
): string {
  return canonicalJson({
    schemaVersion: envelope.schemaVersion,
    type: envelope.message.type,
    cursor: envelope.cursor,
    counts: envelope.counts,
    changes: envelope.changes,
  });
}

export function calculateEnvelopePayloadHash(
  envelope: SyncEnvelope,
): string {
  return sha256(
    canonicalSyncPayload(envelope),
  );
}

export function calculateEnvelopeIdempotencyKey(
  envelope: SyncEnvelope,
): string {
  return sha256(
    canonicalSyncPayload(envelope),
  );
}

export function validateSyncEnvelope(
  value: unknown,
): asserts value is SyncEnvelope {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    throw new Error(
      'Invalid sync envelope: expected an object.',
    );
  }

  const envelope =
    value as Partial<SyncEnvelope>;

  if (envelope.schemaVersion !== 3) {
    throw new Error(
      `Unsupported sync envelope schema version: ${String(
        envelope.schemaVersion,
      )}`,
    );
  }

  if (
    !envelope.message ||
    typeof envelope.message !== 'object'
  ) {
    throw new Error(
      'Invalid sync envelope: message is required.',
    );
  }

  if (
    envelope.message.type !==
    'rekordbox.sync.batch'
  ) {
    throw new Error(
      'Invalid sync envelope: unsupported message type.',
    );
  }

  if (
    typeof envelope.message.id !== 'string' ||
    envelope.message.id.length !== 32
  ) {
    throw new Error(
      'Invalid sync envelope: message.id.',
    );
  }

  if (
    typeof envelope.message.idempotencyKey !==
      'string' ||
    envelope.message.idempotencyKey.length !== 64
  ) {
    throw new Error(
      'Invalid sync envelope: message.idempotencyKey.',
    );
  }

  if (
    typeof envelope.message.createdAt !==
      'string' ||
    envelope.message.createdAt.length === 0
  ) {
    throw new Error(
      'Invalid sync envelope: message.createdAt.',
    );
  }

  if (
    !envelope.cursor ||
    typeof envelope.cursor !== 'object'
  ) {
    throw new Error(
      'Invalid sync envelope: cursor.',
    );
  }

  if (
    typeof envelope.cursor.hasMore !== 'boolean'
  ) {
    throw new Error(
      'Invalid sync envelope: cursor.hasMore.',
    );
  }

  if (
    !envelope.counts ||
    typeof envelope.counts !== 'object'
  ) {
    throw new Error(
      'Invalid sync envelope: counts.',
    );
  }

  if (
    !envelope.counts.changes ||
    typeof envelope.counts.changes !==
      'object'
  ) {
    throw new Error(
      'Invalid sync envelope: counts.changes.',
    );
  }

  if (
    !envelope.changes ||
    typeof envelope.changes !== 'object'
  ) {
    throw new Error(
      'Invalid sync envelope: changes.',
    );
  }

  if (
    !Array.isArray(envelope.changes.added) ||
    !Array.isArray(envelope.changes.updated) ||
    !Array.isArray(envelope.changes.deleted)
  ) {
    throw new Error(
      'Invalid sync envelope: change arrays.',
    );
  }

  if (
    typeof envelope.counts.changes.unchanged !==
      'number' ||
    envelope.counts.changes.unchanged < 0
  ) {
    throw new Error(
      'Invalid sync envelope: unchanged count.',
    );
  }

  if (
    !envelope.integrity ||
    envelope.integrity.algorithm !==
      'sha256' ||
    typeof envelope.integrity.payloadHash !==
      'string' ||
    envelope.integrity.payloadHash.length !==
      64
  ) {
    throw new Error(
      'Invalid sync envelope: integrity.',
    );
  }
}

function validateProcessedBatch(
  value: unknown,
): asserts value is ProcessedChangeBatch {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    throw new Error(
      'Invalid processed change batch: expected an object.',
    );
  }

  const batch =
    value as Partial<ProcessedChangeBatch>;

  if (
    typeof batch.schemaVersion !== 'number'
  ) {
    throw new Error(
      'Invalid processed change batch: schemaVersion.',
    );
  }

  if (!Array.isArray(batch.changes)) {
    throw new Error(
      'Invalid processed change batch: changes must be an array.',
    );
  }

  if (
    typeof batch.processed !== 'number' ||
    typeof batch.scanned !== 'number'
  ) {
    throw new Error(
      'Invalid processed change batch: scanned/processed.',
    );
  }

  if (
    typeof batch.hasMore !== 'boolean'
  ) {
    throw new Error(
      'Invalid processed change batch: hasMore.',
    );
  }

  if (
    !('cursorBefore' in batch) ||
    !('cursorAfter' in batch)
  ) {
    throw new Error(
      'Invalid processed change batch: cursors are required.',
    );
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    const record =
      value as Record<string, unknown>;

    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortRecursively(record[key]);
    }

    return sorted;
  }

  return value;
}

function sha256(value: string): string {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}
