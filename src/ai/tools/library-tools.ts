import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';

export interface LibraryToolTrack {
  readonly id: string;
  readonly title: string | null;
  readonly artist: string | null;
  readonly bpm: number | null;
  readonly key: string | null;
}

export interface LibraryToolAdapter {
  getTrack(id: string): Promise<LibraryToolTrack | null>;
  searchTracks(input: {
    readonly text?: string;
    readonly bpmMin?: number;
    readonly bpmMax?: number;
    readonly ratingMin?: number;
    readonly limit: number;
    readonly offset: number;
  }): Promise<{ readonly items: readonly LibraryToolTrack[]; readonly total: number }>;
  getLibraryStats(): Promise<unknown>;
}

const trackIdInput = z.object({ id: z.string().trim().min(1) }).strict();
const searchInput = z.object({
  text: z.string().trim().optional(),
  bpmMin: z.number().finite().optional(),
  bpmMax: z.number().finite().optional(),
  ratingMin: z.number().finite().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(100_000).default(0),
}).strict();

export function createLibraryTools(
  adapter: LibraryToolAdapter,
): readonly AnyToolDefinition[] {
  return [
    {
      name: 'library.get_track',
      description: 'Read one canonical track from the DJ library.',
      risk: 'read',
      inputSchema: trackIdInput,
      timeoutMs: 5_000,
      execute: ({ id }) => adapter.getTrack(id),
    },
    {
      name: 'library.search_tracks',
      description: 'Search canonical library tracks using bounded filters.',
      risk: 'read',
      inputSchema: searchInput,
      timeoutMs: 10_000,
      execute: (input) => adapter.searchTracks(input),
    },
    {
      name: 'library.stats',
      description: 'Read aggregate statistics for the DJ library.',
      risk: 'read',
      inputSchema: z.object({}).strict(),
      timeoutMs: 5_000,
      execute: () => adapter.getLibraryStats(),
    },
  ];
}
