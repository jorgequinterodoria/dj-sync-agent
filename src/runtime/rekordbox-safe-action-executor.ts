import type { ValidatedDJAction } from '../ai/actions/action-types.js';
import type { RekordboxWritePort } from '../rekordbox/rekordbox-write-port.js';

export interface RekordboxSafeActionExecutor {
  execute(action: ValidatedDJAction): Promise<Record<string, unknown>>;
}

export function createRekordboxSafeActionExecutor(
  writePort: RekordboxWritePort,
): RekordboxSafeActionExecutor {
  return {
    async execute(action) {
      switch (action.action.type) {
        case 'playlist.create': {
          if (!action.action.playlistName) throw new Error('playlistName is required.');
          return { ...await writePort.createPlaylist(action.action.playlistName) };
        }
        case 'playlist.add': {
          if (!action.action.trackId) throw new Error('trackId is required.');
          if (action.action.playlistId === 'dj-copilot-temp' || action.action.playlistId === 'temp') {
            return { ...await writePort.appendToTempPlaylist(action.action.trackId) };
          }
          throw new Error('Direct Rekordbox playlist mutation is disabled. Use the approved XML staging workflow.');
        }
        default:
          throw new Error(`Rekordbox safe action is not supported: ${action.action.type}`);
      }
    },
  };
}
