import type { DJTrack } from '../domain/dj-track.js';

export interface TrackQuery {
  text?: string;
  bpmMin?: number;
  bpmMax?: number;
  ratingMin?: number;
  playCountMax?: number;
  genre?: string;
  key?: string;
  label?: string;
  artist?: string;
  playlistId?: string;
  hasLocalFile?: boolean;
  limit?: number;
  offset?: number;
}

export interface TrackSearchResult {
  items: DJTrack[];
  total: number;
  limit: number;
  offset: number;
}

export interface LibraryStats {
  trackCount: number;
  tracksWithLocalFile: number;
  analyzedTracks: number;
  averageBpm: number | null;
  ratedTracks: number;
}
