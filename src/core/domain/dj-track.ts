import type { NormalizedTrack } from '../../rekordbox/normalized-track.js';

/**
 * Stable DJ-facing domain alias over the existing canonical Rekordbox model.
 *
 * This boundary is intentionally additive: the Rekordbox normalizer remains
 * the source of truth until the domain migration is complete.
 */
export type DJTrack = NormalizedTrack;

export function getTrackDisplayName(track: DJTrack): string {
  const title = track.metadata.title?.trim();
  const artist = track.metadata.artist?.trim();

  if (artist && title) return `${artist} - ${title}`;
  return title ?? artist ?? track.identity.id;
}
