import type {
  LibraryStats,
  TrackQuery,
  TrackSearchResult,
} from './library/library-query.js';
import {
  LibraryService,
  SnapshotLibrarySource,
} from './library/library-service.js';
import type { DJTrack } from './domain/dj-track.js';

export interface DJCoreOptions {
  snapshotPath: string;
}

/**
 * Stable application-facing facade for DJ Copilot.
 *
 * This phase is intentionally additive. Existing Rekordbox, SQLCipher and
 * sync implementations remain the production source of library state.
 */
export class DJCore {
  public readonly library: LibraryService;

  public constructor(options: DJCoreOptions) {
    this.library = new LibraryService(
      new SnapshotLibrarySource(options.snapshotPath),
    );
  }

  public getTrack(
    id: string,
  ): Promise<DJTrack | null> {
    return this.library.getTrack(id);
  }

  public searchTracks(
    query: TrackQuery = {},
  ): Promise<TrackSearchResult> {
    return this.library.searchTracks(query);
  }

  public getLibraryStats(): Promise<LibraryStats> {
    return this.library.getLibraryStats();
  }
}
