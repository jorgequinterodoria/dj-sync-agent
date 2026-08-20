import {
  access,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

import path from 'node:path';

import type { NormalizedTrack } from '../rekordbox/normalized-track.js';

export interface TrackSnapshotEntry {
  id: string;
  uuid: string | null;
  hash: string;
  updatedAt: string | null;
  rbLocalUsn: number | null;
  track: NormalizedTrack;
}

export interface TrackSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  trackCount: number;
  tracks: Record<string, TrackSnapshotEntry>;
}

export interface SnapshotDiff {
  added: string[];
  updated: string[];
  deleted: string[];
  unchanged: string[];
}

export async function readSnapshot(
  filePath: string,
): Promise<TrackSnapshot | null> {
  try {
    await access(filePath);
  } catch {
    return null;
  }

  const raw = await readFile(
    filePath,
    'utf8',
  );

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    throw new Error(
      `Invalid snapshot JSON: ${message}`,
    );
  }

  validateSnapshot(parsed);

  return parsed;
}

export async function writeSnapshot(
  filePath: string,
  snapshot: TrackSnapshot,
): Promise<void> {
  await mkdir(
    path.dirname(filePath),
    {
      recursive: true,
    },
  );

  await writeFile(
    filePath,
    JSON.stringify(
      snapshot,
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

export function buildSnapshot(
  entries: TrackSnapshotEntry[],
  generatedAt = new Date().toISOString(),
): TrackSnapshot {
  const tracks: Record<
    string,
    TrackSnapshotEntry
  > = {};

  for (const entry of entries) {
    tracks[entry.id] = entry;
  }

  return {
    schemaVersion: 1,
    generatedAt,
    trackCount: Object.keys(tracks).length,
    tracks,
  };
}

export function diffSnapshots(
  previous: TrackSnapshot | null,
  current: TrackSnapshot,
): SnapshotDiff {
  const previousTracks =
    previous?.tracks ?? {};

  const currentTracks =
    current.tracks;

  const added: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  for (const [
    id,
    currentEntry,
  ] of Object.entries(currentTracks)) {
    const previousEntry =
      previousTracks[id];

    if (!previousEntry) {
      added.push(id);
      continue;
    }

    if (
      previousEntry.hash !==
      currentEntry.hash
    ) {
      updated.push(id);
      continue;
    }

    unchanged.push(id);
  }

  for (const id of Object.keys(
    previousTracks,
  )) {
    if (!currentTracks[id]) {
      deleted.push(id);
    }
  }

  added.sort();
  updated.sort();
  deleted.sort();
  unchanged.sort();

  return {
    added,
    updated,
    deleted,
    unchanged,
  };
}

function validateSnapshot(
  value: unknown,
): asserts value is TrackSnapshot {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    throw new Error(
      'Invalid snapshot: expected an object.',
    );
  }

  const snapshot =
    value as Partial<TrackSnapshot>;

  if (snapshot.schemaVersion !== 1) {
    throw new Error(
      `Unsupported snapshot schema version: ${String(
        snapshot.schemaVersion,
      )}`,
    );
  }

  if (
    typeof snapshot.generatedAt !==
    'string'
  ) {
    throw new Error(
      'Invalid snapshot: generatedAt must be a string.',
    );
  }

  if (
    typeof snapshot.trackCount !==
    'number'
  ) {
    throw new Error(
      'Invalid snapshot: trackCount must be a number.',
    );
  }

  if (
    !snapshot.tracks ||
    typeof snapshot.tracks !== 'object' ||
    Array.isArray(snapshot.tracks)
  ) {
    throw new Error(
      'Invalid snapshot: tracks must be an object.',
    );
  }
}