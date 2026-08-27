import type {
  DJPlaylist,
} from '../domain/dj-playlist.js';

export interface PlaylistActionRepository {
  addTrack(
    playlistId: string,
    trackId: string,
  ): Promise<void>;

  removeTrack(
    playlistId: string,
    trackId: string,
  ): Promise<void>;

  createPlaylist(
    name: string,
  ): Promise<DJPlaylist>;
}

export interface PlaylistActions {
  addTrack(
    playlistId: string,
    trackId: string,
  ): Promise<void>;

  removeTrack(
    playlistId: string,
    trackId: string,
  ): Promise<void>;

  createPlaylist(
    name: string,
  ): Promise<DJPlaylist>;
}

export function createPlaylistActions(
  repository: PlaylistActionRepository,
): PlaylistActions {
  return {
    addTrack: (playlistId, trackId) =>
      repository.addTrack(
        playlistId.trim(),
        trackId.trim(),
      ),

    removeTrack: (
      playlistId,
      trackId,
    ) =>
      repository.removeTrack(
        playlistId.trim(),
        trackId.trim(),
      ),

    createPlaylist: (name) =>
      repository.createPlaylist(
        name.trim(),
      ),
  };
}
