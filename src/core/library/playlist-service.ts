import type { DJPlaylist } from '../domain/dj-playlist.js';

export interface PlaylistSource {
  load(): Promise<DJPlaylist[]>;
}

export class InMemoryPlaylistSource implements PlaylistSource {
  public constructor(private readonly playlists: DJPlaylist[] = []) {}

  public async load(): Promise<DJPlaylist[]> {
    return this.playlists.map((playlist) => ({
      ...playlist,
      trackIds: [...playlist.trackIds],
    }));
  }
}

export class PlaylistService {
  public constructor(private readonly source: PlaylistSource) {}

  public async getPlaylist(id: string): Promise<DJPlaylist | null> {
    const normalizedId = id.trim();
    if (!normalizedId) return null;
    const playlists = await this.source.load();
    return playlists.find((playlist) => playlist.id === normalizedId) ?? null;
  }

  public async searchPlaylists(text = ''): Promise<DJPlaylist[]> {
    const normalized = text.trim().toLocaleLowerCase();
    const playlists = await this.source.load();

    return playlists
      .filter((playlist) =>
        !normalized || playlist.name.toLocaleLowerCase().includes(normalized),
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
          a.id.localeCompare(b.id),
      );
  }
}
