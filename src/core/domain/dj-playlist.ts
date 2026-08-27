export interface DJPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  parentId: string | null;
  source: 'rekordbox' | 'local';
  updatedAt: string | null;
}

export function getPlaylistTrackCount(playlist: DJPlaylist): number {
  return playlist.trackIds.length;
}
