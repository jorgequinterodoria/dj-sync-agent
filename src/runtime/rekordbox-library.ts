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
    },
  ): Promise<LibraryPage>;

  getById(
    trackId: string,
  ): Promise<NormalizedTrack>;

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

      const items =
        tracks.map(
          toSummary,
        );

      const nextAfterId =
        items.length === limit
          ? items.at(-1)?.id ??
            null
          : null;

      return {
        items,
        total,
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
  };
}

export {
  clampPageSize,
  normalizeSearch,
  toSummary,
};