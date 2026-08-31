import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';
import type { DJPlaylist } from '../../core/domain/dj-playlist.js';

export interface PlaylistToolAdapter {
  getPlaylist(id: string): Promise<DJPlaylist | null>;
  searchPlaylists(text: string): Promise<readonly DJPlaylist[]>;
}

export function createPlaylistTools(
  adapter: PlaylistToolAdapter,
): readonly AnyToolDefinition[] {
  return [
    {
      name: 'playlist.get',
      description: 'Read one playlist from the DJ Core.',
      risk: 'read',
      inputSchema: z.object({ id: z.string().trim().min(1) }).strict(),
      timeoutMs: 5_000,
      execute: ({ id }) => adapter.getPlaylist(id),
    },
    {
      name: 'playlist.search',
      description: 'Search playlists by name.',
      risk: 'read',
      inputSchema: z.object({ text: z.string().trim().max(200).default('') }).strict(),
      timeoutMs: 5_000,
      execute: ({ text }) => adapter.searchPlaylists(text),
    },
  ];
}
