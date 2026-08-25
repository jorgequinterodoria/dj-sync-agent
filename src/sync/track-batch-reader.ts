import type { SqliteDatabase } from '../rekordbox/sqlcipher.js';
import { all } from '../rekordbox/sqlcipher.js';
import type {
  ExtractedCue,
  ExtractedFile,
  ExtractedPlaylistRef,
  ExtractedTrackSample,
} from '../rekordbox/track-extractor.js';

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
  id: string;
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
  ContentID: string;
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
  ContentID: string;
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

export async function readTracksByIds(
  db: SqliteDatabase,
  placeholders: string,
  ids: string[],
): Promise<ExtractedTrackSample[]> {
  const contents = await all<ContentRow>(
    db,
    `
      SELECT *
      FROM djmdContent
      WHERE ID IN (${placeholders})
      ORDER BY ID
    `,
    ids,
  );

  if (contents.length === 0) {
    return [];
  }

  const contentIds = contents.map((row) => row.ID);
  const contentPlaceholders = contentIds.map(() => '?').join(', ');

  const referenceIds = collectReferenceIds(contents);

  const [
    artists,
    albums,
    genres,
    labels,
    keys,
    files,
    cues,
    playlists,
  ] = await Promise.all([
    readLookupMap(db, 'djmdArtist', referenceIds.djmdArtist),
    readLookupMap(db, 'djmdAlbum', referenceIds.djmdAlbum),
    readLookupMap(db, 'djmdGenre', referenceIds.djmdGenre),
    readLookupMap(db, 'djmdLabel', referenceIds.djmdLabel),
    readLookupMap(db, 'djmdKey', referenceIds.djmdKey),
    readFiles(db, contentPlaceholders, contentIds),
    readCues(db, contentPlaceholders, contentIds),
    readPlaylists(db, contentPlaceholders, contentIds),
  ]);

  const filesByContent = groupBy(files, (row) => row.ContentID);
  const cuesByContent = groupBy(cues, (row) => row.ContentID);
  const playlistsByContent = groupBy(playlists, (row) => row.ContentID);

  return contents.map((content) => {
    const fileRecords = (filesByContent.get(content.ID) ?? []).map((row) => ({
      id: row.ID,
      path: cleanString(row.Path),
      localPath: cleanString(row.rb_local_path),
      hash: cleanString(row.Hash),
      size: numberOrNull(row.Size),
      kind: classifyFile(row.Path, row.rb_local_path),
    }));

    const contentFallbackMediaFile =
      pickPrimaryMediaFile(fileRecords) === undefined
        ? createContentFallbackMediaFile(content)
        : null;

    if (contentFallbackMediaFile) {
      fileRecords.push(contentFallbackMediaFile);
    }

    const primaryFile = pickPrimaryMediaFile(fileRecords);

    const bpmRaw = numberOrNull(content.BPM);

    return {
      id: content.ID,
      uuid: cleanString(content.UUID),

      title: cleanString(content.Title),

      artist: lookupValue(
        artists,
        content.ArtistID,
      ),
      album: lookupValue(
        albums,
        content.AlbumID,
      ),
      genre: lookupValue(
        genres,
        content.GenreID,
      ),
      label: lookupValue(
        labels,
        content.LabelID,
      ),
      key: lookupValue(
        keys,
        content.KeyID,
      ),
      remixer: lookupValue(
        artists,
        content.RemixerID,
      ),
      composer: lookupValue(
        artists,
        content.ComposerID,
      ),

      bpmRaw,
      bpm: normalizeBpm(bpmRaw),

      lengthSeconds:
        numberOrNull(content.Length),

      bitrate:
        numberOrNull(content.BitRate),

      bitDepth:
        numberOrNull(content.BitDepth),

      sampleRate:
        numberOrNull(content.SampleRate),

      rating:
        numberOrNull(content.Rating),

      playCount:
        numberOrNull(content.DJPlayCount),

      isrc:
        cleanString(content.ISRC),

      filePath:
        cleanString(content.FolderPath) ??
        primaryFile?.path ??
        primaryFile?.localPath ??
        null,

      fileName:
        cleanString(content.FileNameL) ??
        basename(
          primaryFile?.path ??
            primaryFile?.localPath ??
            null,
        ),

      fileSize:
        numberOrNull(content.FileSize) ??
        primaryFile?.size ??
        null,

      fileType:
        numberOrNull(content.FileType),

      analysisPath:
        cleanString(content.AnalysisDataPath),

      analyzed:
        numberOrNull(content.Analysed),

      rbLocalDeleted:
        numberOrNull(
          content.rb_local_deleted,
        ),

      rbLocalUsn:
        numberOrNull(
          content.rb_local_usn,
        ),

      updatedAt:
        cleanString(content.updated_at),

      files: fileRecords,

      cues:
        (cuesByContent.get(content.ID) ?? [])
          .map((row) => ({
            id: row.ID,
            inMsec: numberOrNull(row.InMsec),
            outMsec: numberOrNull(row.OutMsec),
            kind: numberOrNull(row.Kind),
            color: numberOrNull(row.Color),
            activeLoop: numberOrNull(row.ActiveLoop),
            comment: cleanString(row.Comment),
            beatLoopSize: numberOrNull(row.BeatLoopSize),
            contentUUID: cleanString(row.ContentUUID),
            uuid: cleanString(row.UUID),
          })),

      playlists:
        (playlistsByContent.get(content.ID) ?? [])
          .map((row) => ({
            playlistId: row.PlaylistID,
            playlistName: cleanString(row.playlistName),
            trackNo: numberOrNull(row.TrackNo),
          })),
    };
  });
}

function collectReferenceIds(contents: ContentRow[]) {
  const djmdArtist = new Set<string>();
  const djmdAlbum = new Set<string>();
  const djmdGenre = new Set<string>();
  const djmdLabel = new Set<string>();
  const djmdKey = new Set<string>();

  for (const row of contents) {
    addId(djmdArtist, row.ArtistID);
    addId(djmdArtist, row.RemixerID);
    addId(djmdArtist, row.ComposerID);
    addId(djmdAlbum, row.AlbumID);
    addId(djmdGenre, row.GenreID);
    addId(djmdLabel, row.LabelID);
    addId(djmdKey, row.KeyID);
  }

  return {
    djmdArtist: [...djmdArtist],
    djmdAlbum: [...djmdAlbum],
    djmdGenre: [...djmdGenre],
    djmdLabel: [...djmdLabel],
    djmdKey: [...djmdKey],
  };
}

async function readLookupMap(
  db: SqliteDatabase,
  table: LookupTable,
  ids: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  if (ids.length === 0) {
    return result;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const column = LOOKUP_COLUMNS[table];

  const rows = await all<LookupRow>(
    db,
    `
      SELECT
        ID AS id,
        "${column}" AS value
      FROM "${table}"
      WHERE ID IN (${placeholders})
    `,
    ids,
  );

  for (const row of rows) {
    result.set(row.id, cleanString(row.value));
  }

  return result;
}

async function readFiles(
  db: SqliteDatabase,
  placeholders: string,
  contentIds: string[],
): Promise<FileRow[]> {
  return all<FileRow>(
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
      WHERE ContentID IN (${placeholders})
      ORDER BY ContentID, ID
    `,
    contentIds,
  );
}

async function readCues(
  db: SqliteDatabase,
  placeholders: string,
  contentIds: string[],
): Promise<CueRow[]> {
  return all<CueRow>(
    db,
    `
      SELECT
        ID,
        ContentID,
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
      WHERE ContentID IN (${placeholders})
        AND COALESCE(rb_local_deleted, 0) = 0
      ORDER BY ContentID, InMsec, ID
    `,
    contentIds,
  );
}

async function readPlaylists(
  db: SqliteDatabase,
  placeholders: string,
  contentIds: string[],
): Promise<PlaylistRow[]> {
  return all<PlaylistRow>(
    db,
    `
      SELECT
        sp.PlaylistID,
        sp.ContentID,
        p.Name AS playlistName,
        sp.TrackNo
      FROM djmdSongPlaylist sp
      LEFT JOIN djmdPlaylist p
        ON p.ID = sp.PlaylistID
      WHERE sp.ContentID IN (${placeholders})
        AND COALESCE(sp.rb_local_deleted, 0) = 0
        AND (
          p.ID IS NULL
          OR COALESCE(p.rb_local_deleted, 0) = 0
        )
      ORDER BY
        sp.ContentID,
        p.Seq,
        sp.TrackNo,
        sp.ID
    `,
    contentIds,
  );
}

function lookupValue(
  map: Map<string, string | null>,
  id: string | null | undefined,
): string | null {
  if (!id || id === '0') {
    return null;
  }

  return map.get(id) ?? null;
}

function addId(
  set: Set<string>,
  value: string | null | undefined,
): void {
  if (value && value !== '0') {
    set.add(value);
  }
}

function groupBy<T>(
  rows: T[],
  key: (row: T) => string | null,
): Map<string, T[]> {
  const result = new Map<string, T[]>();

  for (const row of rows) {
    const value = key(row);

    if (!value) {
      continue;
    }

    const list = result.get(value);

    if (list) {
      list.push(row);
    } else {
      result.set(value, [row]);
    }
  }

  return result;
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
        file.kind === 'media' &&
        Boolean(file.localPath),
    ) ??
    files.find(
      (file) => file.kind === 'media',
    ) ??
    files[0]
  );
}

function classifyFile(
  path: string | null,
  localPath: string | null,
): ExtractedFile['kind'] {
  const value =
    `${path ?? ''} ${localPath ?? ''}`.toLowerCase();

  if (
    value.includes('/pioneer/usbanlz/') ||
    /anlz\d{4}\./i.test(value)
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

  if (
    mediaExtensions.some((extension) =>
      value.includes(extension),
    )
  ) {
    return 'media';
  }

  return 'other';
}

function basename(
  filePath: string | null,
): string | null {
  if (!filePath) {
    return null;
  }

  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').at(-1) || null;
}

function normalizeBpm(
  bpmRaw: number | null,
): number | null {
  if (bpmRaw === null || bpmRaw <= 0) {
    return null;
  }

  return bpmRaw >= 1000
    ? bpmRaw / 100
    : bpmRaw;
}

function cleanString(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized =
    value.normalize('NFC').trim();

  return normalized === ''
    ? null
    : normalized;
}

function numberOrNull(
  value: unknown,
): number | null {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}