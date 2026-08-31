import { z } from 'zod';
import type { AnyToolDefinition } from './tool-types.js';
import type { DJCue } from '../../core/domain/dj-cue.js';

export interface CueToolAdapter {
  getCues(trackId: string): Promise<readonly DJCue[]>;
  getCue(trackId: string, cueId: string): Promise<DJCue | null>;
}

export function createCueTools(adapter: CueToolAdapter): readonly AnyToolDefinition[] {
  return [
    {
      name: 'cue.list',
      description: 'Read deterministic cues for a track.',
      risk: 'read',
      inputSchema: z.object({ trackId: z.string().trim().min(1) }).strict(),
      timeoutMs: 5_000,
      execute: ({ trackId }) => adapter.getCues(trackId),
    },
    {
      name: 'cue.get',
      description: 'Read one cue for a track.',
      risk: 'read',
      inputSchema: z.object({
        trackId: z.string().trim().min(1),
        cueId: z.string().trim().min(1),
      }).strict(),
      timeoutMs: 5_000,
      execute: ({ trackId, cueId }) => adapter.getCue(trackId, cueId),
    },
  ];
}
