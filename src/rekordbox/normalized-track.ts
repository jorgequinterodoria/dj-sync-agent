import type {
  ExtractedCue,
  ExtractedFile,
  ExtractedPlaylistRef,
  ExtractedTrackSample,
} from './track-extractor.js';

export interface NormalizedTrack {
  schemaVersion: 1;
  identity: {
    id: string;
    uuid: string | null;
  };
  metadata: {
    title: string | null;
    artist: string | null;
    album: string | null;
    genre: string | null;
    label: string | null;
    key: string | null;
    remixer: string | null;
    composer: string | null;
    isrc: string | null;
  };
  technical: {
    bpmRaw: number | null;
    bpm: number | null;
    lengthSeconds: number | null;
    bitrate: number | null;
    bitDepth: number | null;
    sampleRate: number | null;
    rating: number | null;
    playCount: number | null;
    fileType: number | null;
    analyzed: number | null;
  };
  primaryFile: {
    id: string | null;
    path: string | null;
    localPath: string | null;
    hash: string | null;
    size: number | null;
    kind: ExtractedFile['kind'] | null;
  };
  files: ExtractedFile[];
  cues: ExtractedCue[];
  playlists: ExtractedPlaylistRef[];
  sync: {
    rbLocalDeleted: number | null;
    rbLocalUsn: number | null;
    updatedAt: string | null;
  };
}

export function normalizeTrack(input: ExtractedTrackSample): NormalizedTrack {
  const primaryFile = pickPrimaryFile(input);

  return {
    schemaVersion: 1,
    identity: {
      id: input.id,
      uuid: cleanString(input.uuid),
    },
    metadata: {
      title: cleanString(input.title),
      artist: cleanString(input.artist),
      album: cleanString(input.album),
      genre: cleanString(input.genre),
      label: cleanString(input.label),
      key: cleanString(input.key),
      remixer: cleanString(input.remixer),
      composer: cleanString(input.composer),
      isrc: cleanString(input.isrc),
    },
    technical: {
      bpmRaw: finiteNumber(input.bpmRaw),
      bpm: finiteNumber(input.bpm),
      lengthSeconds: finiteNumber(input.lengthSeconds),
      bitrate: finiteNumber(input.bitrate),
      bitDepth: finiteNumber(input.bitDepth),
      sampleRate: finiteNumber(input.sampleRate),
      rating: finiteNumber(input.rating),
      playCount: finiteNumber(input.playCount),
      fileType: finiteNumber(input.fileType),
      analyzed: finiteNumber(input.analyzed),
    },
    primaryFile: primaryFile
      ? {
          id: cleanString(primaryFile.id),
          path: cleanString(primaryFile.path),
          localPath: cleanString(primaryFile.localPath),
          hash: cleanString(primaryFile.hash),
          size: finiteNumber(primaryFile.size),
          kind: primaryFile.kind,
        }
      : {
          id: null,
          path: null,
          localPath: null,
          hash: null,
          size: null,
          kind: null,
        },
    files: normalizeFiles(input.files),
    cues: normalizeCues(input.cues),
    playlists: normalizePlaylists(input.playlists),
    sync: {
      rbLocalDeleted: finiteNumber(input.rbLocalDeleted),
      rbLocalUsn: finiteNumber(input.rbLocalUsn),
      updatedAt: cleanString(input.updatedAt),
    },
  };
}

function pickPrimaryFile(input: ExtractedTrackSample): ExtractedFile | null {
  return (
    input.files.find(
      (file) => file.kind === 'media' && Boolean(file.localPath),
    ) ??
    input.files.find((file) => file.kind === 'media') ??
    buildContentFileFallback(input)
  );
}

function buildContentFileFallback(
  input: ExtractedTrackSample,
): ExtractedFile | null {
  const path = cleanString(input.filePath);
  const fileName = cleanString(input.fileName);
  const size = finiteNumber(input.fileSize);

  if (!path && !fileName && size === null) {
    return null;
  }

  const resolvedPath = path ?? fileName;

  return {
    id: `content:${input.id}`,
    path: resolvedPath,
    localPath: resolvedPath,
    hash: null,
    size,
    kind: 'media',
  };
}

function normalizeFiles(files: ExtractedFile[]): ExtractedFile[] {
  return [...files]
    .map((file) => ({
      id: file.id,
      path: cleanString(file.path),
      localPath: cleanString(file.localPath),
      hash: cleanString(file.hash),
      size: finiteNumber(file.size),
      kind: file.kind,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeCues(cues: ExtractedCue[]): ExtractedCue[] {
  return [...cues]
    .map((cue) => ({
      id: cue.id,
      inMsec: finiteNumber(cue.inMsec),
      outMsec: finiteNumber(cue.outMsec),
      kind: finiteNumber(cue.kind),
      color: finiteNumber(cue.color),
      activeLoop: finiteNumber(cue.activeLoop),
      comment: cleanString(cue.comment),
      beatLoopSize: finiteNumber(cue.beatLoopSize),
      contentUUID: cleanString(cue.contentUUID),
      uuid: cleanString(cue.uuid),
    }))
    .sort((a, b) => {
      const inA = a.inMsec ?? Number.POSITIVE_INFINITY;
      const inB = b.inMsec ?? Number.POSITIVE_INFINITY;
      return inA - inB || a.id.localeCompare(b.id);
    });
}

function normalizePlaylists(playlists: ExtractedPlaylistRef[]): ExtractedPlaylistRef[] {
  return [...playlists]
    .map((playlist) => ({
      playlistId: playlist.playlistId,
      playlistName: cleanString(playlist.playlistName),
      trackNo: finiteNumber(playlist.trackNo),
    }))
    .sort((a, b) =>
      a.playlistId.localeCompare(b.playlistId) ||
      (a.trackNo ?? Number.POSITIVE_INFINITY) - (b.trackNo ?? Number.POSITIVE_INFINITY),
    );
}

function cleanString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.normalize('NFC').trim();
  return normalized === '' ? null : normalized;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}