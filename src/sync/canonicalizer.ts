import { createHash } from 'node:crypto';
import type { NormalizedTrack } from '../rekordbox/normalized-track.js';

export interface CanonicalTrack {
  identity: NormalizedTrack['identity'];
  metadata: NormalizedTrack['metadata'];
  technical: NormalizedTrack['technical'];
  primaryFile: NormalizedTrack['primaryFile'];
  files: NormalizedTrack['files'];
  cues: NormalizedTrack['cues'];
  playlists: NormalizedTrack['playlists'];
}

export function toCanonicalTrack(
  track: NormalizedTrack,
): CanonicalTrack {
  return {
    identity: track.identity,
    metadata: track.metadata,
    technical: track.technical,
    primaryFile: track.primaryFile,
    files: track.files,
    cues: track.cues,
    playlists: track.playlists,
  };
}

export function canonicalJson(
  track: NormalizedTrack,
): string {
  return JSON.stringify(toCanonicalTrack(track));
}

export function trackHash(
  track: NormalizedTrack,
): string {
  return createHash('sha256')
    .update(canonicalJson(track), 'utf8')
    .digest('hex');
}