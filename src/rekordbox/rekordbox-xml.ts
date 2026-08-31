import { pathToFileURL } from 'node:url';

import type { DJPlaylist } from '../core/domain/dj-playlist.js';
import type { NormalizedTrack } from './normalized-track.js';

export interface RekordboxXmlTrack {
  readonly track: NormalizedTrack;
}

export interface RekordboxXmlExportInput {
  readonly playlists: readonly DJPlaylist[];
  readonly tracks: readonly RekordboxXmlTrack[];
  readonly productName?: string;
  readonly productVersion?: string;
  readonly company?: string;
}

export interface RekordboxXmlExportResult {
  readonly xml: string;
  readonly playlistCount: number;
  readonly trackCount: number;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function optionalAttribute(
  name: string,
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return ` ${name}="${escapeXml(String(value))}"`;
}

function integerTrackId(id: string): string {
  const value = id.trim();
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Rekordbox XML requires numeric TrackID: ${id}`);
  }
  return value;
}

function trackLocation(track: NormalizedTrack): string {
  const value = track.primaryFile.localPath ?? track.primaryFile.path;
  if (!value?.trim()) {
    throw new Error(`Track ${track.identity.id} has no local file location.`);
  }

  const normalized = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized)) {
    return normalized;
  }

  return pathToFileURL(normalized).toString();
}

function rating(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(255, Math.round(value * 51)));
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

function trackXml(track: NormalizedTrack): string {
  const attributes = [
    `TrackID="${escapeXml(integerTrackId(track.identity.id))}"`,
    optionalAttribute('Name', track.metadata.title),
    optionalAttribute('Artist', track.metadata.artist),
    optionalAttribute('Composer', track.metadata.composer),
    optionalAttribute('Album', track.metadata.album),
    optionalAttribute('Genre', track.metadata.genre),
    optionalAttribute('Kind', track.primaryFile.kind),
    optionalAttribute('Size', track.primaryFile.size),
    optionalAttribute('TotalTime', track.technical.lengthSeconds === null ? null : Math.round(track.technical.lengthSeconds)),
    optionalAttribute('AverageBpm', track.technical.bpm),
    optionalAttribute('BitRate', track.technical.bitrate),
    optionalAttribute('SampleRate', track.technical.sampleRate),
    optionalAttribute('PlayCount', track.technical.playCount),
    optionalAttribute('Rating', rating(track.technical.rating)),
    optionalAttribute('DateModified', formatDate(track.sync.updatedAt)),
    optionalAttribute('Remixer', track.metadata.remixer),
    optionalAttribute('Tonality', track.metadata.key),
    optionalAttribute('Label', track.metadata.label),
    optionalAttribute('Location', trackLocation(track)),
  ].join('');

  const cues = track.cues
    .filter((cue) => cue.inMsec !== null)
    .map((cue, index) => {
      const start = (cue.inMsec ?? 0) / 1000;
      const end = cue.outMsec === null ? start : cue.outMsec / 1000;
      const type = cue.activeLoop ? 4 : 0;
      const num = cue.kind === 1 || cue.kind === 2 || cue.kind === 3 ? cue.kind - 1 : -1;
      return `<POSITION_MARK${optionalAttribute('Name', cue.comment)} Type="${type}" Start="${start}" End="${end}" Num="${num}" />`;
    });

  const tempo = track.technical.bpm === null
    ? []
    : [`<TEMPO Inizio="0" Bpm="${track.technical.bpm}" Metro="4/4" Battito="1" />`];

  if (cues.length === 0 && tempo.length === 0) {
    return `<TRACK ${attributes} />`;
  }

  return [
    `<TRACK ${attributes}>`,
    ...tempo,
    ...cues,
    '</TRACK>',
  ].join('');
}

interface TreeNode {
  readonly playlist: DJPlaylist;
  readonly children: TreeNode[];
}

function buildTree(playlists: readonly DJPlaylist[]): TreeNode[] {
  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const children = new Map<string | null, DJPlaylist[]>();

  for (const playlist of playlists) {
    const parent = playlist.parentId && byId.has(playlist.parentId)
      ? playlist.parentId
      : null;
    const list = children.get(parent) ?? [];
    list.push(playlist);
    children.set(parent, list);
  }

  const visiting = new Set<string>();

  function node(playlist: DJPlaylist): TreeNode {
    if (visiting.has(playlist.id)) {
      throw new Error(`Playlist hierarchy cycle detected at ${playlist.id}.`);
    }
    visiting.add(playlist.id);
    const result = {
      playlist,
      children: (children.get(playlist.id) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(node),
    };
    visiting.delete(playlist.id);
    return result;
  }

  return (children.get(null) ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(node);
}

function playlistNode(node: TreeNode): string {
  const playlist = node.playlist;
  if (node.children.length > 0) {
    return [
      `<NODE Type="0" Name="${escapeXml(playlist.name)}" Count="${node.children.length}">`,
      ...node.children.map(playlistNode),
      '</NODE>',
    ].join('');
  }

  return [
    `<NODE Type="1" Name="${escapeXml(playlist.name)}" Entries="${playlist.trackIds.length}" KeyType="0">`,
    ...playlist.trackIds.map((trackId) => `<TRACK Key="${escapeXml(integerTrackId(trackId))}" />`),
    '</NODE>',
  ].join('');
}

export function renderRekordboxPlaylistXml(
  input: RekordboxXmlExportInput,
): RekordboxXmlExportResult {
  const productName = input.productName ?? 'DJ Sync Agent';
  const productVersion = input.productVersion ?? '1.0.0';
  const company = input.company ?? 'DJ Sync Agent';
  const trackById = new Map(input.tracks.map(({ track }) => [track.identity.id, track]));
  const referencedIds = [...new Set(input.playlists.flatMap((playlist) => playlist.trackIds))];

  for (const id of referencedIds) {
    if (!trackById.has(id)) {
      throw new Error(`Playlist references missing track ${id}.`);
    }
  }

  const tracks = referencedIds
    .map((id) => trackById.get(id)!)
    .sort((a, b) => integerTrackId(a.identity.id).localeCompare(integerTrackId(b.identity.id), undefined, { numeric: true }));

  const tree = buildTree(input.playlists);
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    `<PRODUCT Name="${escapeXml(productName)}" Version="${escapeXml(productVersion)}" Company="${escapeXml(company)}" />`,
    `<COLLECTION Entries="${tracks.length}">`,
    ...tracks.map(trackXml),
    '</COLLECTION>',
    '<PLAYLISTS>',
    `<NODE Type="0" Name="ROOT" Count="${tree.length}">`,
    ...tree.map(playlistNode),
    '</NODE>',
    '</PLAYLISTS>',
    '</DJ_PLAYLISTS>',
    '',
  ].join('\n');

  return {
    xml,
    playlistCount: input.playlists.length,
    trackCount: tracks.length,
  };
}
