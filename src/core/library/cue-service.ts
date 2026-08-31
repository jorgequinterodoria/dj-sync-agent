import type { DJCue } from '../domain/dj-cue.js';
import { sortCues } from '../domain/dj-cue.js';

export interface CueSource {
  load(trackId: string): Promise<DJCue[]>;
}

export class InMemoryCueSource implements CueSource {
  public constructor(private readonly cuesByTrack: Record<string, DJCue[]> = {}) {}

  public async load(trackId: string): Promise<DJCue[]> {
    return (this.cuesByTrack[trackId] ?? []).map((cue) => ({ ...cue }));
  }
}

export class CueService {
  public constructor(private readonly source: CueSource) {}

  public async getCues(trackId: string): Promise<DJCue[]> {
    const normalizedId = trackId.trim();
    if (!normalizedId) return [];
    return sortCues(await this.source.load(normalizedId));
  }

  public async getCue(trackId: string, cueId: string): Promise<DJCue | null> {
    const normalizedTrackId = trackId.trim();
    const normalizedCueId = cueId.trim();
    if (!normalizedTrackId || !normalizedCueId) return null;
    const cues = await this.getCues(normalizedTrackId);
    return cues.find((cue) => cue.id === normalizedCueId) ?? null;
  }
}
