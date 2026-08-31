import type { NormalizedTrack } from '../rekordbox/normalized-track.js';
import type { SetBuilderCandidate } from './set-builder.js';

export function toSetBuilderCandidate(
  track: NormalizedTrack,
  options: {
    readonly recentlyPlayed?: boolean;
    readonly energy?: number | null;
  } = {},
): SetBuilderCandidate {
  return {
    trackId: track.identity.id,
    trackHash: track.primaryFile.hash,
    title: track.metadata.title,
    artist: track.metadata.artist,
    genre: track.metadata.genre,
    key: track.metadata.key,
    bpm: track.technical.bpm,
    energy: options.energy ?? null,
    rating: track.technical.rating,
    playCount: track.technical.playCount,
    recentlyPlayed: options.recentlyPlayed ?? false,
    durationSeconds:
      track.technical.lengthSeconds,
  };
}
