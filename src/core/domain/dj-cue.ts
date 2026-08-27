export type DJCueType = 'cue' | 'memory' | 'hot';

export interface DJCue {
  id: string;
  trackId: string;
  type: DJCueType;
  positionSeconds: number;
  name: string | null;
  color: string | null;
  comment: string | null;
  order: number;
}

export function sortCues(cues: DJCue[]): DJCue[] {
  return [...cues].sort(
    (a, b) =>
      a.positionSeconds - b.positionSeconds ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
}
