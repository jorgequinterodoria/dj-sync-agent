import {
  close,
  openEncryptedReadOnlyDatabase,
  type SqliteDatabase,
  all,
} from '../rekordbox/sqlcipher.js';

import {
  countActiveTracks,
  extractTrackSamplesPage,
} from '../rekordbox/track-extractor.js';

import {
  readTracksByIds,
} from '../sync/track-batch-reader.js';

import {
  normalizeTrack,
  type NormalizedTrack,
} from '../rekordbox/normalized-track.js';
import type { DJPlaylist } from '../core/domain/dj-playlist.js';

import type {
  loadConfig,
} from '../config/env.js';

type Config =
  ReturnType<typeof loadConfig>;

export interface LibraryTrackSummary {
  id: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  bpm: number | null;
  key: string | null;
  lengthSeconds: number | null;
  rating: number | null;
  playCount: number | null;
  genre: string | null;
  filePath: string | null;
  analyzed: number | null;
  rbLocalUsn: number | null;
}

export interface LibraryPage {
  items: LibraryTrackSummary[];
  total: number;
  nextAfterId: string | null;
  hasMore: boolean;
}

interface SearchIdRow {
  ID: string;
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

function clampPageSize(
  value: number,
): number {
  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(
    value,
    MAX_PAGE_SIZE,
  );
}

function normalizeSearch(
  value: string | undefined,
): string {
  return (
    value
      ?.normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ') ??
    ''
  );
}

function toSummary(
  track: NormalizedTrack,
): LibraryTrackSummary {
  return {
    id:
      track.identity.id,

    title:
      track.metadata.title,

    artist:
      track.metadata.artist,

    album:
      track.metadata.album,

    bpm:
      track.technical.bpm,

    key:
      track.metadata.key,

    lengthSeconds:
      track.technical.lengthSeconds,

    rating:
      track.technical.rating,

    playCount:
      track.technical.playCount,

    genre:
      track.metadata.genre,

    filePath:
      track.primaryFile.localPath ??
      track.primaryFile.path,

    analyzed:
      track.technical.analyzed,

    rbLocalUsn:
      track.sync.rbLocalUsn,
  };
}

const SEARCH_FIELDS = [
  'c.Title',
  'artist.Name',
  'album.Name',
  'genre.Name',
  'label.Name',
  'key.ScaleName',
] as const;

function buildSearchPredicate(): string {
  return SEARCH_FIELDS
    .map(
      (
        field,
      ) =>
        `instr(lower(COALESCE(${field}, '')), lower(?)) > 0`,
    )
    .join('\nOR ');
}

async function searchTrackIds(
  db: SqliteDatabase,
  search: string,
  afterId: string | null,
  limit: number,
): Promise<string[]> {
  const predicate =
    buildSearchPredicate();

  const params: Array<
    string | number
  > = [
    ...SEARCH_FIELDS.map(
      () => search,
    ),
  ];

  if (
    afterId !== null
  ) {
    params.push(afterId);
  }

  params.push(limit);

  const rows =
    await all<SearchIdRow>(
      db,
      `
        SELECT c.ID
        FROM djmdContent c
        LEFT JOIN djmdArtist artist
          ON artist.ID = c.ArtistID
        LEFT JOIN djmdAlbum album
          ON album.ID = c.AlbumID
        LEFT JOIN djmdGenre genre
          ON genre.ID = c.GenreID
        LEFT JOIN djmdLabel label
          ON label.ID = c.LabelID
        LEFT JOIN djmdKey key
          ON key.ID = c.KeyID
        WHERE COALESCE(
          c.rb_local_deleted,
          0
        ) = 0
          AND (
            ${predicate}
          )
          ${
            afterId !== null
              ? 'AND c.ID > ?'
              : ''
          }
        ORDER BY c.ID
        LIMIT ?
      `,
      params,
    );

  return rows.map(
    (row) =>
      row.ID,
  );
}

async function countSearchMatches(
  db: SqliteDatabase,
  search: string,
): Promise<number> {
  const predicate =
    buildSearchPredicate();

  const params =
    SEARCH_FIELDS.map(
      () => search,
    );

  const rows =
    await all<{
      count: number;
    }>(
      db,
      `
        SELECT COUNT(*) AS count
        FROM djmdContent c
        LEFT JOIN djmdArtist artist
          ON artist.ID = c.ArtistID
        LEFT JOIN djmdAlbum album
          ON album.ID = c.AlbumID
        LEFT JOIN djmdGenre genre
          ON genre.ID = c.GenreID
        LEFT JOIN djmdLabel label
          ON label.ID = c.LabelID
        LEFT JOIN djmdKey key
          ON key.ID = c.KeyID
        WHERE COALESCE(
          c.rb_local_deleted,
          0
        ) = 0
          AND (
            ${predicate}
          )
      `,
      params,
    );

  return Number(
    rows[0]?.count ?? 0,
  );
}

export interface RekordboxLibraryService {
  list(
    options?: {
      afterId?: string | null;
      limit?: number;
      search?: string;
      readonly genres?: readonly string[] | string | null;
      readonly bpmMin?: number | null;
      readonly bpmMax?: number | null;
      readonly keys?: readonly string[] | string | null;
    },
  ): Promise<LibraryPage>;

  getById(
    trackId: string,
  ): Promise<NormalizedTrack>;

  listPlaylists(
    args?: {
      readonly search?: string;
      readonly limit?: number;
    },
  ): Promise<DJPlaylist[]>;

  getPlaylist(
    id: string,
  ): Promise<DJPlaylist | null>;

  getPlaylistTrackIds(
    id: string,
  ): Promise<readonly string[]>;

  close(): Promise<void>;
}

export function createRekordboxLibraryService(
  config: Config,
): RekordboxLibraryService {
  let db:
    | SqliteDatabase
    | null =
    null;

  let dbOpening:
    | Promise<SqliteDatabase>
    | null =
    null;

  async function ensureDatabase():
    Promise<SqliteDatabase> {
    if (db !== null) {
      return db;
    }

    if (
      dbOpening !== null
    ) {
      return dbOpening;
    }

    dbOpening =
      openEncryptedReadOnlyDatabase(
        config.rekordboxDbPath,
        config.REKORDBOX_DB_KEY?.trim() ||
          undefined,
        config.REKORDBOX_CIPHER_COMPATIBILITY,
      );

    try {
      db =
        await dbOpening;

      return db;
    } finally {
      dbOpening = null;
    }
  }

  return {
    async list(
      options = {},
    ): Promise<LibraryPage> {
      const database =
        await ensureDatabase();

      const limit =
        clampPageSize(
          options.limit ??
            DEFAULT_PAGE_SIZE,
        );

      const afterId =
        options.afterId?.trim() ||
        null;

      const search =
        normalizeSearch(
          options.search,
        );

      let rawTracks:
        Awaited<
          ReturnType<
            typeof extractTrackSamplesPage
          >
        >;

      let total: number;

      if (
        search === ''
      ) {
        total =
          await countActiveTracks(
            database,
          );

        rawTracks =
          await extractTrackSamplesPage(
            database,
            afterId,
            limit,
          );
      } else {
        total =
          await countSearchMatches(
            database,
            search,
          );

        const ids =
          await searchTrackIds(
            database,
            search,
            afterId,
            limit,
          );

        if (
          ids.length === 0
        ) {
          rawTracks = [];
        } else {
          rawTracks =
            await readTracksByIds(
              database,
              ids
                .map(
                  () => '?',
                )
                .join(', '),
              ids,
            );
        }
      }

      const tracks =
        rawTracks.map(
          (raw) =>
            normalizeTrack(
              raw,
            ),
        );

      const genresNormalized: string[] | null = (() => {
        const g = options.genres;
        if (!g) return null;
        const arr = typeof g === 'string' ? [g] : [...g];
        const cleaned = arr
          .map((x) => x?.toString().trim())
          .filter((x): x is string => Boolean(x));
        return cleaned.length ? cleaned : null;
      })();

      const keysNormalized: string[] | null = (() => {
        const k = options.keys;
        if (!k) return null;
        const arr = typeof k === 'string' ? [k] : [...k];
        const cleaned = arr
          .map((x) => x?.toString().trim())
          .filter((x): x is string => Boolean(x));
        return cleaned.length ? cleaned : null;
      })();

      const bpmMin =
        typeof options.bpmMin === 'number' && Number.isFinite(options.bpmMin)
          ? options.bpmMin
          : null;
      const bpmMax =
        typeof options.bpmMax === 'number' && Number.isFinite(options.bpmMax)
          ? options.bpmMax
          : null;

      const hasAdvancedFilters =
        genresNormalized !== null ||
        keysNormalized !== null ||
        bpmMin !== null ||
        bpmMax !== null;

      const filteredTracks = hasAdvancedFilters
        ? tracks.filter((t) => {
            if (genresNormalized) {
              const g = (t.metadata?.genre ?? '').trim();
              if (!g) return false;
              const match = genresNormalized.some(
                (want) =>
                  g.localeCompare(want, undefined, { sensitivity: 'base' }) ===
                    0 ||
                  g.toLowerCase().includes(want.toLowerCase()),
              );
              if (!match) return false;
            }
            if (keysNormalized) {
              const k = (t.metadata?.key ?? '').trim();
              if (!k) return false;
              const match = keysNormalized.some(
                (want) =>
                  k.localeCompare(want, undefined, { sensitivity: 'base' }) ===
                    0 ||
                  k.toLowerCase().includes(want.toLowerCase()),
              );
              if (!match) return false;
            }
            const bpm: number | null =
              typeof t.technical?.bpm === 'number' ? t.technical.bpm : null;
            if (bpmMin !== null && bpm !== null) {
              if (bpm < bpmMin) return false;
            }
            if (bpmMax !== null && bpm !== null) {
              if (bpm > bpmMax) return false;
            }
            if (bpmMin !== null && bpm === null) return false;
            if (bpmMax !== null && bpm === null) return false;
            return true;
          })
        : tracks;

      const items =
        filteredTracks.map(
          toSummary,
        );

      const displayTotal = hasAdvancedFilters
        ? filteredTracks.length
        : total;

      const nextAfterId =
        items.length === limit && !hasAdvancedFilters
          ? items.at(-1)?.id ??
            null
          : null;

      return {
        items,
        total: displayTotal,
        nextAfterId,
        hasMore:
          nextAfterId !==
          null,
      };
    },

    async getById(
      trackId: string,
    ): Promise<NormalizedTrack> {
      const normalizedId =
        trackId.trim();

      if (
        normalizedId === ''
      ) {
        throw new Error(
          'Track ID is required.',
        );
      }

      const database =
        await ensureDatabase();

      const tracks =
        await readTracksByIds(
          database,
          '?',
          [
            normalizedId,
          ],
        );

      const raw =
        tracks[0];

      if (
        raw === undefined
      ) {
        throw new Error(
          `Track ${normalizedId} was not found.`,
        );
      }

      return normalizeTrack(
        raw,
      );
    },

    async close(): Promise<void> {
      if (
        db === null
      ) {
        return;
      }

      const current =
        db;

      db = null;

      await close(
        current,
      );
    },

    async listPlaylists(args?: {
      readonly search?: string;
      readonly limit?: number;
    }): Promise<DJPlaylist[]> {
      const database =
        await ensureDatabase();
      const cap =
        Math.max(1, Math.min(2000, Number(args?.limit ?? 500)));
      const all =
        await extractPlaylistsFromRekordbox(
          database,
          cap,
        );
      const q =
        normalizeSearch(args?.search).toLocaleLowerCase();
      if (!q) return all;
      return all.filter((p) =>
        p.name.toLocaleLowerCase().includes(q),
      );
    },

    async getPlaylist(
      id: string,
    ): Promise<DJPlaylist | null> {
      const normalizedId =
        id.trim();
      if (!normalizedId) return null;
      const database =
        await ensureDatabase();
      const all =
        await extractPlaylistsFromRekordbox(
          database,
          2000,
        );
      return (
        all.find((p) => p.id === normalizedId) ??
        null
      );
    },

    async getPlaylistTrackIds(
      id: string,
    ): Promise<readonly string[]> {
      const playlist =
        await this.getPlaylist(id);
      return playlist?.trackIds ?? [];
    },
  };
}

interface PlaylistRow {
  ID: string;
  Name: string | null;
  ParentID: string | null;
  UpdateDate: string | null;
}

interface PlaylistContentRow {
  PlaylistID: string;
  ContentID: string;
  Seq: number | null;
}

export async function extractPlaylistsFromRekordbox(
  db: SqliteDatabase,
  limit = 500,
): Promise<DJPlaylist[]> {
  const playlistRows =
    await all<PlaylistRow>(
      db,
      `SELECT
        p.ID as ID,
        p.Name as Name,
        p.ParentID as ParentID,
        p.UpdateDate as UpdateDate
       FROM djmdPlaylist p
       WHERE COALESCE(p.rb_local_deleted, 0) = 0
       ORDER BY COALESCE(p.Seq, 0) ASC, p.Name ASC
       LIMIT ?`,
      [Math.max(1, Math.min(2000, Number(limit) || 500))],
    );

  const playlistIds =
    playlistRows.map((row) => row.ID);

  const contentRows: PlaylistContentRow[] =
    playlistIds.length === 0
      ? []
      : await all<PlaylistContentRow>(
          db,
          `SELECT sp.PlaylistID as PlaylistID, sp.ContentID as ContentID, sp.Seq as Seq
           FROM djmdSongPlaylist sp
           WHERE sp.PlaylistID IN (${playlistIds.map(() => '?').join(',')})
             AND COALESCE(sp.rb_local_deleted, 0) = 0
           ORDER BY sp.PlaylistID, COALESCE(sp.Seq, 0) ASC`,
          playlistIds,
        );

  const byId =
    new Map<string, string[]>();

  for (const row of contentRows) {
    const list =
      byId.get(row.PlaylistID) ?? [];
    list.push(row.ContentID);
    byId.set(row.PlaylistID, list);
  }

  return playlistRows.map((row) => {
    const trackIds = byId.get(row.ID) ?? [];
    return {
      id: row.ID,
      name: row.Name?.toString() ?? '',
      trackIds,
      parentId: row.ParentID?.toString() ?? null,
      source: 'rekordbox' as const,
      updatedAt: row.UpdateDate?.toString() ?? null,
    };
  });
}

export {
  clampPageSize,
  normalizeSearch,
  toSummary,
};