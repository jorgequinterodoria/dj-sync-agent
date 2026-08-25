import type { SqliteDatabase } from './sqlcipher.js';
import { all } from './sqlcipher.js';

export interface ExtractedFile {
  id: string;
  path: string | null;
  localPath: string | null;
  hash: string | null;
  size: number | null;
  kind: 'media' | 'analysis' | 'other';
}

export interface ExtractedCue {
  id: string;
  inMsec: number | null;
  outMsec: number | null;
  kind: number | null;
  color: number | null;
  activeLoop: number | null;
  comment: string | null;
  beatLoopSize: number | null;
  contentUUID: string | null;
  uuid: string | null;
}

export interface ExtractedPlaylistRef {
  playlistId: string;
  playlistName: string | null;
  trackNo: number | null;
}

export interface ExtractedTrackSample {
  id: string;
  uuid: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  label: string | null;
  key: string | null;
  remixer: string | null;
  composer: string | null;
  bpmRaw: number | null;
  bpm: number | null;
  lengthSeconds: number | null;
  bitrate: number | null;
  bitDepth: number | null;
  sampleRate: number | null;
  rating: number | null;
  playCount: number | null;
  isrc: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: number | null;
  analysisPath: string | null;
  analyzed: number | null;
  rbLocalDeleted: number | null;
  rbLocalUsn: number | null;
  updatedAt: string | null;
  files: ExtractedFile[];
  cues: ExtractedCue[];
  playlists: ExtractedPlaylistRef[];
}

interface ContentRow {
  ID: string;
  UUID?: string | null;
  Title?: string | null;
  ArtistID?: string | null;
  AlbumID?: string | null;
  GenreID?: string | null;
  LabelID?: string | null;
  KeyID?: string | null;
  RemixerID?: string | null;
  ComposerID?: string | null;
  BPM?: number | string | null;
  Length?: number | string | null;
  BitRate?: number | string | null;
  BitDepth?: number | string | null;
  SampleRate?: number | string | null;
  Rating?: number | string | null;
  DJPlayCount?: number | string | null;
  ISRC?: string | null;
  FolderPath?: string | null;
  FileNameL?: string | null;
  FileSize?: number | string | null;
  FileType?: number | string | null;
  AnalysisDataPath?: string | null;
  Analysed?: number | string | null;
  rb_local_deleted?: number | string | null;
  rb_local_usn?: number | string | null;
  updated_at?: string | null;
}

interface LookupRow {
  value: string | null;
}

interface FileRow {
  ID: string;
  ContentID: string | null;
  Path: string | null;
  rb_local_path: string | null;
  Hash: string | null;
  Size: number | string | null;
}

interface CueRow {
  ID: string;
  InMsec: number | string | null;
  OutMsec: number | string | null;
  Kind: number | string | null;
  Color: number | string | null;
  ActiveLoop: number | string | null;
  Comment: string | null;
  BeatLoopSize: number | string | null;
  ContentUUID: string | null;
  UUID: string | null;
}

interface PlaylistRow {
  PlaylistID: string;
  playlistName: string | null;
  TrackNo: number | string | null;
}

const LOOKUP_COLUMNS = {
  djmdArtist: 'Name',
  djmdAlbum: 'Name',
  djmdGenre: 'Name',
  djmdLabel: 'Name',
  djmdKey: 'ScaleName',
} as const;

type LookupTable = keyof typeof LOOKUP_COLUMNS;

export async function countActiveTracks(
  db: SqliteDatabase,
): Promise<number> {
  const rows = await all<{ count: number }>(
    db,
    `
      SELECT COUNT(*) AS count
      FROM djmdContent
      WHERE COALESCE(rb_local_deleted, 0) = 0
    `,
  );

  return Number(rows[0]?.count ?? 0);
}

/**
 * Extract a stable page of active Rekordbox tracks.
 *
 * Pagination uses the same ID ordering as the existing extractor,
 * with a strict lower bound so a page can be resumed without offsets.
 */
export async function extractTrackSamplesPage(
  db: SqliteDatabase,
  afterId: string | null,
  limit = 250,
): Promise<ExtractedTrackSample[]> {
  if (
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    throw new Error(
      'Track page limit must be a positive integer.',
    );
  }

  const contentRows = afterId === null
    ? await all<ContentRow>(
        db,
        `
          SELECT *
          FROM djmdContent
          WHERE COALESCE(rb_local_deleted, 0) = 0
          ORDER BY ID
          LIMIT ?
        `,
        [limit],
      )
    : await all<ContentRow>(
        db,
        `
          SELECT *
          FROM djmdContent
          WHERE COALESCE(rb_local_deleted, 0) = 0
            AND ID > ?
          ORDER BY ID
          LIMIT ?
        `,
        [afterId, limit],
      );

  const tracks: ExtractedTrackSample[] = [];

  for (const content of contentRows) {
    const [
      artist,
      album,
      genre,
      label,
      key,
      remixer,
      composer,
      files,
      cues,
      playlists,
    ] = await Promise.all([
      lookupValue(db, 'djmdArtist', content.ArtistID),
      lookupValue(db, 'djmdAlbum', content.AlbumID),
      lookupValue(db, 'djmdGenre', content.GenreID),
      lookupValue(db, 'djmdLabel', content.LabelID),
      lookupValue(db, 'djmdKey', content.KeyID),
      lookupValue(db, 'djmdArtist', content.RemixerID),
      lookupValue(db, 'djmdArtist', content.ComposerID),
      getFiles(db, content.ID),
      getCues(db, content.ID),
      getPlaylists(db, content.ID),
    ]);

    const contentFallbackMediaFile =
      pickPrimaryMediaFile(files) === undefined
        ? createContentFallbackMediaFile(content)
        : null;

    if (contentFallbackMediaFile) {
      files.push(contentFallbackMediaFile);
    }

    const primaryFile =
      pickPrimaryMediaFile(files);

    const bpmRaw =
      numberOrNull(content.BPM);

    tracks.push({
      id: content.ID,
      uuid:
        cleanString(
          content.UUID,
        ),

      title:
        cleanString(
          content.Title,
        ),

      artist:
        cleanString(artist),
      album:
        cleanString(album),
      genre:
        cleanString(genre),
      label:
        cleanString(label),
      key:
        cleanString(key),
      remixer:
        cleanString(remixer),
      composer:
        cleanString(composer),

      bpmRaw,
      bpm:
        normalizeBpm(bpmRaw),

      lengthSeconds:
        numberOrNull(
          content.Length,
        ),

      bitrate:
        numberOrNull(
          content.BitRate,
        ),
      bitDepth:
        numberOrNull(
          content.BitDepth,
        ),
      sampleRate:
        numberOrNull(
          content.SampleRate,
        ),

      rating:
        numberOrNull(
          content.Rating,
        ),
      playCount:
        numberOrNull(
          content.DJPlayCount,
        ),

      isrc:
        cleanString(
          content.ISRC,
        ),

      filePath:
        cleanString(
          content.FolderPath,
        ) ??
        primaryFile?.path ??
        primaryFile?.localPath ??
        null,

      fileName:
        cleanString(
          content.FileNameL,
        ) ??
        basename(
          primaryFile?.path ??
            primaryFile?.localPath ??
            null,
        ),

      fileSize:
        numberOrNull(
          content.FileSize,
        ) ??
        primaryFile?.size ??
        null,

      fileType:
        numberOrNull(
          content.FileType,
        ),

      analysisPath:
        cleanString(
          content.AnalysisDataPath,
        ),
      analyzed:
        numberOrNull(
          content.Analysed,
        ),

      rbLocalDeleted:
        numberOrNull(
          content.rb_local_deleted,
        ),
      rbLocalUsn:
        numberOrNull(
          content.rb_local_usn,
        ),
      updatedAt:
        cleanString(
          content.updated_at,
        ),

      files,
      cues,
      playlists,
    });
  }

  return tracks;
}

/**
 * Backwards-compatible sample API.
 */
export async function extractTrackSamples(
  db: SqliteDatabase,
  limit = 10,
): Promise<ExtractedTrackSample[]> {
  return extractTrackSamplesPage(
    db,
    null,
    limit,
  );
}

async function lookupValue(
  db: SqliteDatabase,
  table: LookupTable,
  id:
    | string
    | null
    | undefined,
): Promise<string | null> {
  if (!id || id === '0') {
    return null;
  }

  const column =
    LOOKUP_COLUMNS[table];

  const rows =
    await all<LookupRow>(
      db,
      `
        SELECT "${column}" AS value
        FROM "${table}"
        WHERE "ID" = ?
        LIMIT 1
      `,
      [id],
    );

  return cleanString(
    rows[0]?.value,
  );
}

async function getFiles(
  db: SqliteDatabase,
  contentId: string,
): Promise<ExtractedFile[]> {
  const rows =
    await all<FileRow>(
      db,
      `
        SELECT
          ID,
          ContentID,
          Path,
          rb_local_path,
          Hash,
          Size
        FROM contentFile
        WHERE ContentID = ?
        ORDER BY ID
      `,
      [contentId],
    );

  return rows.map(
    (row) => ({
      id: row.ID,
      path:
        cleanString(row.Path),
      localPath:
        cleanString(
          row.rb_local_path,
        ),
      hash:
        cleanString(row.Hash),
      size:
        numberOrNull(row.Size),
      kind:
        classifyFile(
          row.Path,
          row.rb_local_path,
        ),
    }),
  );
}

async function getCues(
  db: SqliteDatabase,
  contentId: string,
): Promise<ExtractedCue[]> {
  const rows =
    await all<CueRow>(
      db,
      `
        SELECT
          ID,
          InMsec,
          OutMsec,
          Kind,
          Color,
          ActiveLoop,
          Comment,
          BeatLoopSize,
          ContentUUID,
          UUID
        FROM djmdCue
        WHERE ContentID = ?
          AND COALESCE(
            rb_local_deleted,
            0
          ) = 0
        ORDER BY
          InMsec,
          ID
      `,
      [contentId],
    );

  return rows.map(
    (row) => ({
      id: row.ID,
      inMsec:
        numberOrNull(
          row.InMsec,
        ),
      outMsec:
        numberOrNull(
          row.OutMsec,
        ),
      kind:
        numberOrNull(row.Kind),
      color:
        numberOrNull(row.Color),
      activeLoop:
        numberOrNull(
          row.ActiveLoop,
        ),
      comment:
        cleanString(
          row.Comment,
        ),
      beatLoopSize:
        numberOrNull(
          row.BeatLoopSize,
        ),
      contentUUID:
        cleanString(
          row.ContentUUID,
        ),
      uuid:
        cleanString(row.UUID),
    }),
  );
}

async function getPlaylists(
  db: SqliteDatabase,
  contentId: string,
): Promise<ExtractedPlaylistRef[]> {
  const rows =
    await all<PlaylistRow>(
      db,
      `
        SELECT
          sp.PlaylistID AS PlaylistID,
          p.Name AS playlistName,
          sp.TrackNo AS TrackNo
        FROM djmdSongPlaylist sp
        LEFT JOIN djmdPlaylist p
          ON p.ID = sp.PlaylistID
        WHERE sp.ContentID = ?
          AND COALESCE(
            sp.rb_local_deleted,
            0
          ) = 0
          AND (
            p.ID IS NULL
            OR COALESCE(
              p.rb_local_deleted,
              0
            ) = 0
          )
        ORDER BY
          p.Seq,
          sp.TrackNo,
          sp.ID
      `,
      [contentId],
    );

  return rows.map(
    (row) => ({
      playlistId:
        row.PlaylistID,
      playlistName:
        cleanString(
          row.playlistName,
        ),
      trackNo:
        numberOrNull(
          row.TrackNo,
        ),
    }),
  );
}


function createContentFallbackMediaFile(
  content: ContentRow,
): ExtractedFile | null {
  const folderPath = cleanString(content.FolderPath);
  const fileName = cleanString(content.FileNameL);
  const candidatePath = resolveContentFilePath(folderPath, fileName);

  if (!candidatePath || !looksLikeMediaFile(candidatePath)) {
    return null;
  }

  return {
    id: `content:${content.ID}`,
    path: candidatePath,
    localPath: isAbsoluteLocalPath(candidatePath)
      ? candidatePath
      : null,
    hash: null,
    size: numberOrNull(content.FileSize),
    kind: 'media',
  };
}

function resolveContentFilePath(
  folderPath: string | null,
  fileName: string | null,
): string | null {
  if (folderPath && fileName) {
    const normalizedFolder = folderPath.replace(/\\/g, '/');
    const normalizedName = fileName.replace(/\\/g, '/').replace(/^\/+/, '');

    if (
      normalizedFolder.toLowerCase() === normalizedName.toLowerCase() ||
      normalizedFolder.toLowerCase().endsWith(`/${normalizedName.toLowerCase()}`)
    ) {
      return normalizedFolder;
    }

    if (normalizedFolder.toLowerCase().match(/\.[a-z0-9]{2,5}$/i)) {
      return normalizedFolder;
    }

    return `${normalizedFolder.replace(/\/+$/, '')}/${normalizedName}`;
  }

  return folderPath ?? fileName ?? null;
}

function looksLikeMediaFile(filePath: string): boolean {
  return /\.(mp3|wav|wave|aif|aiff|flac|m4a|aac|ogg|oga|alac|mp4|mov)$/i.test(
    filePath,
  );
}

function isAbsoluteLocalPath(filePath: string): boolean {
  return (
    filePath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(filePath) ||
    filePath.startsWith('\\\\')
  );
}

function pickPrimaryMediaFile(
  files: ExtractedFile[],
): ExtractedFile | undefined {
  return (
    files.find(
      (file) =>
        file.kind ===
          'media' &&
        Boolean(
          file.localPath,
        ),
    ) ??
    files.find(
      (file) =>
        file.kind ===
        'media',
    ) ??
    files[0]
  );
}

function classifyFile(
  path: string | null,
  localPath: string | null,
): ExtractedFile['kind'] {
  const value =
    `${path ?? ''} ${
      localPath ?? ''
    }`.toLowerCase();

  if (
    value.includes(
      '/pioneer/usbanlz/',
    ) ||
    /anlz\d{4}\./i.test(
      value,
    )
  ) {
    return 'analysis';
  }

  const mediaExtensions = [
    '.mp3',
    '.wav',
    '.wave',
    '.aif',
    '.aiff',
    '.flac',
    '.m4a',
    '.aac',
    '.ogg',
    '.oga',
    '.alac',
    '.mp4',
    '.mov',
  ];

  for (
    const extension of
      mediaExtensions
  ) {
    if (
      value.includes(
        extension,
      )
    ) {
      return 'media';
    }
  }

  return 'other';
}

function basename(
  filePath: string | null,
): string | null {
  if (!filePath) {
    return null;
  }

  const normalized =
    filePath.replace(
      /\\/g,
      '/',
    );

  const parts =
    normalized.split('/');

  return (
    parts.at(-1) || null
  );
}

function normalizeBpm(
  bpmRaw: number | null,
): number | null {
  if (
    bpmRaw === null ||
    bpmRaw <= 0
  ) {
    return null;
  }

  if (bpmRaw >= 1000) {
    return bpmRaw / 100;
  }

  return bpmRaw;
}

function numberOrNull(
  value: unknown,
): number | null {
  if (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
  ) {
    return value;
  }

  if (
    typeof value ===
      'string' &&
    value.trim() !== ''
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  }

  return null;
}

function cleanString(
  value:
    | string
    | null
    | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized =
    value
      .normalize('NFC')
      .trim();

  return normalized === ''
    ? null
    : normalized;
}