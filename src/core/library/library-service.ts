import type { DJTrack } from '../domain/dj-track.js';
import { getTrackDisplayName } from '../domain/dj-track.js';
import type {
  LibraryStats,
  TrackQuery,
  TrackSearchResult,
} from './library-query.js';
import {
  readSnapshot,
  type TrackSnapshot,
} from '../../sync/snapshot-store.js';

export interface LibrarySource {
  load(): Promise<TrackSnapshot | null>;
}

export class SnapshotLibrarySource implements LibrarySource {
  public constructor(
    private readonly snapshotPath: string,
  ) {}

  public load(): Promise<TrackSnapshot | null> {
    return readSnapshot(this.snapshotPath);
  }
}

export class LibraryService {
  public constructor(
    private readonly source: LibrarySource,
  ) {}

  public async getTrack(
    id: string,
  ): Promise<DJTrack | null> {
    const normalizedId = id.trim();
    if (!normalizedId) return null;

    const snapshot = await this.source.load();
    if (!snapshot) return null;

    return snapshot.tracks[normalizedId]?.track ?? null;
  }

  public async searchTracks(
    query: TrackQuery = {},
  ): Promise<TrackSearchResult> {
    const snapshot = await this.source.load();

    const tracks: DJTrack[] = snapshot
      ? Object.values(snapshot.tracks).map(
          (entry) => entry.track,
        )
      : [];

    const filtered = tracks.filter((track) =>
      matchesQuery(track, query),
    );

    const sorted = filtered.sort(compareTracks);
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);

    return {
      items: sorted.slice(offset, offset + limit),
      total: sorted.length,
      limit,
      offset,
    };
  }

  public async getLibraryStats(): Promise<LibraryStats> {
    const snapshot = await this.source.load();

    const tracks: DJTrack[] = snapshot
      ? Object.values(snapshot.tracks).map(
          (entry) => entry.track,
        )
      : [];

    let bpmSum = 0;
    let bpmCount = 0;
    let tracksWithLocalFile = 0;
    let analyzedTracks = 0;
    let ratedTracks = 0;

    for (const track of tracks) {
      const bpm = track.technical.bpm;
      if (typeof bpm === 'number' && Number.isFinite(bpm)) {
        bpmSum += bpm;
        bpmCount += 1;
      }

      if (track.primaryFile.localPath) {
        tracksWithLocalFile += 1;
      }

      if (track.technical.analyzed !== null && track.technical.analyzed > 0) {
        analyzedTracks += 1;
      }

      if (
        track.technical.rating !== null &&
        Number.isFinite(track.technical.rating)
      ) {
        ratedTracks += 1;
      }
    }

    return {
      trackCount: tracks.length,
      tracksWithLocalFile,
      analyzedTracks,
      averageBpm:
        bpmCount === 0 ? null : bpmSum / bpmCount,
      ratedTracks,
    };
  }
}

function matchesQuery(
  track: DJTrack,
  query: TrackQuery,
): boolean {
  if (
    query.bpmMin !== undefined &&
    !matchesMin(track.technical.bpm, query.bpmMin)
  ) {
    return false;
  }

  if (
    query.bpmMax !== undefined &&
    !matchesMax(track.technical.bpm, query.bpmMax)
  ) {
    return false;
  }

  if (
    query.ratingMin !== undefined &&
    !matchesMin(track.technical.rating, query.ratingMin)
  ) {
    return false;
  }

  if (
    query.playCountMax !== undefined &&
    !matchesMax(track.technical.playCount, query.playCountMax)
  ) {
    return false;
  }

  if (
    query.genre !== undefined &&
    !containsNormalized(track.metadata.genre, query.genre)
  ) {
    return false;
  }

  if (
    query.key !== undefined &&
    !containsNormalized(track.metadata.key, query.key)
  ) {
    return false;
  }

  if (
    query.label !== undefined &&
    !containsNormalized(track.metadata.label, query.label)
  ) {
    return false;
  }

  if (
    query.artist !== undefined &&
    !containsNormalized(track.metadata.artist, query.artist)
  ) {
    return false;
  }

  if (
    query.playlistId !== undefined &&
    !track.playlists.some(
      (playlist) => playlist.playlistId === query.playlistId,
    )
  ) {
    return false;
  }

  if (
    query.hasLocalFile !== undefined &&
    Boolean(track.primaryFile.localPath) !== query.hasLocalFile
  ) {
    return false;
  }

  if (
    query.text !== undefined &&
    !matchesText(track, query.text)
  ) {
    return false;
  }

  return true;
}

function matchesMin(
  value: number | null,
  minimum: number,
): boolean {
  return value !== null && value >= minimum;
}

function matchesMax(
  value: number | null,
  maximum: number,
): boolean {
  return value !== null && value <= maximum;
}

function matchesText(
  track: DJTrack,
  value: string,
): boolean {
  const needle = normalize(value);
  if (!needle) return true;

  const haystack = [
    track.metadata.title,
    track.metadata.artist,
    track.metadata.album,
    track.metadata.genre,
    track.metadata.label,
    track.metadata.key,
    track.metadata.remixer,
    track.metadata.composer,
    track.metadata.isrc,
    ...track.playlists.map(
      (playlist) => playlist.playlistName,
    ),
  ]
    .filter((item): item is string => Boolean(item))
    .map(normalize)
    .join(' ');

  return haystack.includes(needle);
}

function containsNormalized(
  value: string | null,
  expected: string,
): boolean {
  return (
    value !== null &&
    normalize(value).includes(normalize(expected))
  );
}

function compareTracks(
  a: DJTrack,
  b: DJTrack,
): number {
  return (
    getTrackDisplayName(a).localeCompare(
      getTrackDisplayName(b),
      undefined,
      { sensitivity: 'base' },
    ) ||
    a.identity.id.localeCompare(b.identity.id)
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase();
}

function normalizeLimit(
  value: number | undefined,
): number {
  if (value === undefined) return 100;

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      'Track query limit must be a positive integer.',
    );
  }

  return Math.min(value, 1000);
}

function normalizeOffset(
  value: number | undefined,
): number {
  if (value === undefined) return 0;

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      'Track query offset must be a non-negative integer.',
    );
  }

  return value;
}
