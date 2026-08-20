import { readFile } from 'node:fs/promises';

import {
  calculateEnvelopeIdempotencyKey,
  calculateEnvelopePayloadHash,
  validateSyncEnvelope,
  type SyncEnvelope,
} from './sync-envelope.js';

export interface EnvelopeValidationReport {
  schemaVersion: 1;
  valid: boolean;

  deterministic: {
    id: boolean;
    idempotencyKey: boolean;
    payloadHash: boolean;
  };

  counts: {
    scanned: number;
    processed: number;
    added: number;
    updated: number;
    deleted: number;
    unchanged: number;
  };

  errors: string[];
}

export async function validateEnvelopeFile(
  filePath: string,
): Promise<EnvelopeValidationReport> {
  const raw = await readFile(filePath, 'utf8');

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    return {
      schemaVersion: 1,
      valid: false,
      deterministic: {
        id: false,
        idempotencyKey: false,
        payloadHash: false,
      },
      counts: {
        scanned: 0,
        processed: 0,
        added: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
      },
      errors: [`Invalid JSON: ${message}`],
    };
  }

  const errors: string[] = [];

  try {
    validateSyncEnvelope(parsed);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    errors.push(message);
  }

  if (errors.length > 0) {
    return {
      schemaVersion: 1,
      valid: false,
      deterministic: {
        id: false,
        idempotencyKey: false,
        payloadHash: false,
      },
      counts: {
        scanned: 0,
        processed: 0,
        added: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
      },
      errors,
    };
  }

  const envelope =
    parsed as SyncEnvelope;

  const expectedIdempotencyKey =
    calculateEnvelopeIdempotencyKey(
      envelope,
    );

  const expectedId =
    expectedIdempotencyKey.slice(0, 32);

  const expectedPayloadHash =
    calculateEnvelopePayloadHash(
      envelope,
    );

  const idValid =
    envelope.message.id === expectedId;

  const idempotencyValid =
    envelope.message.idempotencyKey ===
    expectedIdempotencyKey;

  const payloadHashValid =
    envelope.integrity.payloadHash ===
    expectedPayloadHash;

  if (!idValid) {
    errors.push(
      'message.id does not match the deterministic semantic identity.',
    );
  }

  if (!idempotencyValid) {
    errors.push(
      'message.idempotencyKey does not match the deterministic semantic identity.',
    );
  }

  if (!payloadHashValid) {
    errors.push(
      'integrity.payloadHash does not match the canonical semantic payload.',
    );
  }

  const added =
    envelope.changes.added.length;

  const updated =
    envelope.changes.updated.length;

  const deleted =
    envelope.changes.deleted.length;

  const unchanged =
    envelope.counts.changes.unchanged;

  const processed =
    envelope.counts.processed;

  const scanned =
    envelope.counts.scanned;

  if (
    envelope.counts.changes.added !==
      added ||
    envelope.counts.changes.updated !==
      updated ||
    envelope.counts.changes.deleted !==
      deleted
  ) {
    errors.push(
      'counts.changes does not match the actual change arrays.',
    );
  }

  /*
   * `processed` includes both real changes and
   * successfully processed unchanged candidates.
   */
  if (
    added +
      updated +
      deleted +
      unchanged !==
    processed
  ) {
    errors.push(
      'processed must equal added + updated + deleted + unchanged.',
    );
  }

  if (processed > scanned) {
    errors.push(
      'processed cannot exceed scanned.',
    );
  }

  if (
    unchanged < 0 ||
    !Number.isInteger(unchanged)
  ) {
    errors.push(
      'unchanged must be a non-negative integer.',
    );
  }

  return {
    schemaVersion: 1,
    valid: errors.length === 0,

    deterministic: {
      id: idValid,
      idempotencyKey: idempotencyValid,
      payloadHash: payloadHashValid,
    },

    counts: {
      scanned,
      processed,
      added,
      updated,
      deleted,
      unchanged,
    },

    errors,
  };
}
