import type { SqliteDatabase } from '../rekordbox/sqlcipher.js';
import {
  extractTrackSamples,
  type ExtractedTrackSample,
} from '../rekordbox/track-extractor.js';
import { normalizeTrack } from '../rekordbox/normalized-track.js';
import { trackHash } from './canonicalizer.js';
import { scanChangeBatch, type ChangeBatchResult } from './change-scanner.js';
import type { ChangeCursor } from './change-cursor.js';

export interface ProcessedChange {
  id: string;
  uuid: string | null;
  action: 'upsert' | 'delete';
  hash: string | null;
  rbLocalUsn: number | null;
  updatedAt: string | null;
  track: ReturnType<typeof normalizeTrack> | null;
}

export interface ProcessBatchResult {
  schemaVersion: 1;
  cursorBefore: ChangeCursor | null;
  cursorAfter: ChangeCursor | null;
  hasMore: boolean;
  scanned: number;
  active: number;
  deleted: number;
  processed: number;
  changes: ProcessedChange[];
}

export async function processChangeBatch(
  db: SqliteDatabase,
  cursor: ChangeCursor | null,
  batchSize = 500,
): Promise<ProcessBatchResult> {
  const batch: ChangeBatchResult = await scanChangeBatch(
    db,
    cursor,
    batchSize,
  );

  if (batch.candidates.length === 0) {
    return {
      schemaVersion: 1,
      cursorBefore: batch.cursorBefore,
      cursorAfter: batch.cursorAfter,
      hasMore: false,
      scanned: 0,
      active: 0,
      deleted: 0,
      processed: 0,
      changes: [],
    };
  }

  const activeCandidates = batch.candidates.filter(
    (candidate) => candidate.rbLocalDeleted === 0,
  );

  const extractedById = new Map<string, ExtractedTrackSample>();

  if (activeCandidates.length > 0) {
    const extracted = await extractTracksByIds(
      db,
      activeCandidates.map((candidate) => candidate.id),
    );

    for (const sample of extracted) {
      extractedById.set(sample.id, sample);
    }
  }

  const changes: ProcessedChange[] = [];

  for (const candidate of batch.candidates) {
    if (candidate.rbLocalDeleted !== 0) {
      changes.push({
        id: candidate.id,
        uuid: candidate.uuid,
        action: 'delete',
        hash: null,
        rbLocalUsn: candidate.rbLocalUsn,
        updatedAt: candidate.updatedAt,
        track: null,
      });
      continue;
    }

    const raw = extractedById.get(candidate.id);

    if (!raw) {
      throw new Error(
        `Change candidate ${candidate.id} was not returned by track extraction.`,
      );
    }

    const track = normalizeTrack(raw);

    changes.push({
      id: candidate.id,
      uuid: candidate.uuid,
      action: 'upsert',
      hash: trackHash(track),
      rbLocalUsn: candidate.rbLocalUsn,
      updatedAt: candidate.updatedAt,
      track,
    });
  }

  return {
    schemaVersion: 1,
    cursorBefore: batch.cursorBefore,
    cursorAfter: batch.cursorAfter,
    hasMore: batch.hasMore,
    scanned: batch.returned,
    active: batch.activeCount,
    deleted: batch.deletedCount,
    processed: changes.length,
    changes,
  };
}

/**
 * Batch extraction is intentionally isolated from the existing
 * sample extractor. It avoids N+1 database queries while preserving
 * the exact same normalization rules as V0.5.
 */
async function extractTracksByIds(
  db: SqliteDatabase,
  ids: string[],
): Promise<ExtractedTrackSample[]> {
  if (ids.length === 0) {
    return [];
  }

  // SQLite parameter limits vary by build. Use conservative chunks.
  const chunkSize = 300;
  const result: ExtractedTrackSample[] = [];

  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');

    // We intentionally reuse extractTrackSamples only for bounded
    // batches where deterministic ordering and normalization are needed.
    //
    // The current extractor selects by global ORDER BY/LIMIT, so for
    // arbitrary IDs it cannot be safely reused. The processor therefore
    // falls back to a targeted implementation below.
    const targeted = await extractTargetedTracks(
      db,
      placeholders,
      chunk,
    );

    result.push(...targeted);
  }

  return result;
}

async function extractTargetedTracks(
  db: SqliteDatabase,
  placeholders: string,
  ids: string[],
): Promise<ExtractedTrackSample[]> {
  // We use a small dynamic import here to keep the target extraction
  // implementation private to V0.6.2 while avoiding circular imports.
  //
  // The actual targeted extraction lives in track-batch-reader.ts.
  const { readTracksByIds } = await import(
    './track-batch-reader.js'
  );

  return readTracksByIds(
    db,
    placeholders,
    ids,
  );
}
