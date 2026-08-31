import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { DJPlaylist } from '../core/domain/dj-playlist.js';
import type { NormalizedTrack } from './normalized-track.js';
import { renderRekordboxPlaylistXml } from './rekordbox-xml.js';

export interface RekordboxWritePort {
  exportCollection(): Promise<RekordboxWriteResult>;
  createPlaylist(name: string): Promise<RekordboxWriteResult>;
  appendToTempPlaylist(trackId: string): Promise<RekordboxWriteResult>;
}

export interface RekordboxWriteResult {
  readonly status: 'staged';
  readonly operation: 'export' | 'create_playlist' | 'append_to_temp_playlist';
  readonly outputPath: string;
  readonly playlistCount: number;
  readonly trackCount: number;
  readonly masterDbTouched: false;
}

export interface RekordboxWritePortOptions {
  readonly listPlaylists: (args?: { readonly limit?: number }) => Promise<readonly DJPlaylist[]>;
  readonly getTrack: (trackId: string) => Promise<NormalizedTrack>;
  readonly outputDir: string;
  readonly productVersion?: string;
  readonly now?: () => string;
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'operation';
}

function operationFileName(operation: string, now: string): string {
  return `rekordbox-${safeFilePart(operation)}-${now.replace(/[:.]/g, '-')}.xml`;
}

export function createRekordboxWritePort(options: RekordboxWritePortOptions): RekordboxWritePort {
  const now = options.now ?? (() => new Date().toISOString());

  async function writeSnapshot(
    operation: RekordboxWriteResult['operation'],
    playlists: readonly DJPlaylist[],
  ): Promise<RekordboxWriteResult> {
    const trackIds = [...new Set(playlists.flatMap((playlist) => playlist.trackIds))];
    const tracks = await Promise.all(trackIds.map(async (trackId) => ({ track: await options.getTrack(trackId) })));
    const rendered = renderRekordboxPlaylistXml({
      playlists,
      tracks,
      ...(options.productVersion !== undefined ? { productVersion: options.productVersion } : {}),
    });
    const outputDir = resolve(options.outputDir);
    await mkdir(outputDir, { recursive: true });
    const outputPath = join(outputDir, operationFileName(operation, now()));
    await writeFile(outputPath, rendered.xml, { encoding: 'utf8', flag: 'wx' });
    return {
      status: 'staged',
      operation,
      outputPath,
      playlistCount: rendered.playlistCount,
      trackCount: rendered.trackCount,
      masterDbTouched: false,
    };
  }

  return {
    async exportCollection() {
      const playlists = await options.listPlaylists({ limit: 2000 });
      return writeSnapshot('export', playlists);
    },

    async createPlaylist(name) {
      const normalizedName = name.trim();
      if (!normalizedName) throw new Error('Playlist name is required.');
      const playlists = [...await options.listPlaylists({ limit: 2000 })];
      if (playlists.some((playlist) => playlist.parentId === null && playlist.name.localeCompare(normalizedName, undefined, { sensitivity: 'base' }) === 0)) {
        throw new Error(`Playlist already exists at the root level: ${normalizedName}`);
      }
      const next: DJPlaylist = {
        id: `copilot-${safeFilePart(normalizedName).toLowerCase()}-${Date.now()}`,
        name: normalizedName,
        trackIds: [],
        parentId: null,
        source: 'local',
        updatedAt: now(),
      };
      return writeSnapshot('create_playlist', [...playlists, next]);
    },

    async appendToTempPlaylist(trackId) {
      const normalizedTrackId = trackId.trim();
      if (!normalizedTrackId) throw new Error('Track id is required.');
      await options.getTrack(normalizedTrackId);
      const playlists = [...await options.listPlaylists({ limit: 2000 })];
      const tempName = 'DJ Copilot Temp';
      const existing = playlists.find((playlist) => playlist.parentId === null && playlist.name === tempName);
      if (existing) {
        if (!existing.trackIds.includes(normalizedTrackId)) {
          existing.trackIds.push(normalizedTrackId);
        }
      } else {
        playlists.push({
          id: `copilot-temp-${Date.now()}`,
          name: tempName,
          trackIds: [normalizedTrackId],
          parentId: null,
          source: 'local',
          updatedAt: now(),
        });
      }
      return writeSnapshot('append_to_temp_playlist', playlists);
    },
  };
}
