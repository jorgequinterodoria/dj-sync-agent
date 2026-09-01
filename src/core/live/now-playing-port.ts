export type NowPlayingSourceType = 'manual' | 'rekordbox_active_cue_polling' | 'midi' | 'osc' | 'unknown';

export interface LiveNowPlaying {
  trackId: string;
  trackHash?: string | null;
  title?: string | null;
  artist?: string | null;
  bpm?: number | null;
  musicalKey?: string | null;
  startPlaybackAt: string | null;
  elapsedMs: number;
  durationMs: number | null;
  energyHint01?: number | null;
  sourceType: NowPlayingSourceType;
  observedAt: string;
}

export interface NowPlayingSourcePort {
  readonly name: string;
  readonly sourceType: NowPlayingSourceType;
  getCurrent(): Promise<LiveNowPlaying | null>;
  subscribe?(listener: (nowPlaying: LiveNowPlaying | null) => void): () => void;
  close?(): Promise<void>;
}

export const DEFAULT_NOW_PLAYING_POLLING_INTERVAL_MS = 500 as const;

export function emptyNowPlaying(source: NowPlayingSourceType = 'unknown', now?: string): LiveNowPlaying {
  const iso = now ?? new Date().toISOString();
  return {
    trackId: '',
    startPlaybackAt: null,
    elapsedMs: 0,
    durationMs: null,
    sourceType: source,
    observedAt: iso,
  };
}

export function isNowPlayingValid(np: LiveNowPlaying | null): np is LiveNowPlaying & { trackId: string } {
  if (!np) return false;
  const id = np.trackId?.trim() ?? '';
  return id.length > 0;
}

export class ManualNowPlayingSource implements NowPlayingSourcePort {
  public readonly name = 'ManualNowPlayingSource';
  public readonly sourceType = 'manual' as const;

  private current: LiveNowPlaying | null = null;
  private listeners = new Set<(np: LiveNowPlaying | null) => void>();

  public pushTrack(input: {
    trackId: string;
    trackHash?: string | null;
    title?: string | null;
    artist?: string | null;
    bpm?: number | null;
    musicalKey?: string | null;
    durationMs?: number | null;
    energyHint01?: number | null;
    now?: string;
  }): LiveNowPlaying {
    const observedAt = input.now ?? new Date().toISOString();
    const next: LiveNowPlaying = {
      trackId: input.trackId.trim(),
      trackHash: input.trackHash ?? null,
      title: input.title ?? null,
      artist: input.artist ?? null,
      bpm: input.bpm ?? null,
      musicalKey: input.musicalKey ?? null,
      startPlaybackAt: observedAt,
      elapsedMs: 0,
      durationMs: input.durationMs ?? null,
      energyHint01: input.energyHint01 ?? null,
      sourceType: 'manual',
      observedAt,
    };
    this.current = next;
    for (const l of this.listeners) l(next);
    return next;
  }

  public tickElapsed(addMs: number, now?: string): LiveNowPlaying | null {
    if (!this.current) return null;
    const add = Math.max(0, Math.trunc(addMs));
    const duration = this.current.durationMs;
    const capped = duration == null
      ? Math.max(0, this.current.elapsedMs + add)
      : Math.min(Math.max(0, duration), Math.max(0, this.current.elapsedMs + add));
    const observedAt = now ?? new Date().toISOString();
    const updated: LiveNowPlaying = {
      ...this.current,
      elapsedMs: capped,
      observedAt,
    };
    this.current = updated;
    for (const l of this.listeners) l(updated);
    return updated;
  }

  public clear(now?: string): void {
    this.current = {
      ...emptyNowPlaying('manual', now),
      observedAt: now ?? new Date().toISOString(),
    };
    for (const l of this.listeners) l(null);
  }

  public async getCurrent(): Promise<LiveNowPlaying | null> {
    return this.current;
  }

  public subscribe(listener: (np: LiveNowPlaying | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}


export function clampElapsed(elapsedMs: number, durationMs: number | null): number {
  if (durationMs == null) return Math.max(0, Math.trunc(elapsedMs));
  return Math.max(0, Math.min(Math.trunc(durationMs), Math.trunc(elapsedMs)));
}

export { ProDjLinkNowPlayingSource } from './pro-dj-link-now-playing.js';

export interface RekordboxActiveCuePollingSourceOptions {
  masterDbPath?: string | null;
  pollingIntervalMs?: number;
  deviceId?: string;
}

import { ProDjLinkNowPlayingSource } from './pro-dj-link-now-playing.js';

export class RekordboxActiveCuePollingSource extends ProDjLinkNowPlayingSource {
  public readonly name: ProDjLinkNowPlayingSource['name'] = 'ProDjLinkNowPlayingSource';
  public readonly masterDbPath: string | null;
  public readonly pollingIntervalMs: number;

  constructor(options: RekordboxActiveCuePollingSourceOptions = {}) {
    super({ announceIntervalMs: options.pollingIntervalMs ?? DEFAULT_NOW_PLAYING_POLLING_INTERVAL_MS });
    this.masterDbPath = options.masterDbPath ?? null;
    this.pollingIntervalMs = options.pollingIntervalMs ?? DEFAULT_NOW_PLAYING_POLLING_INTERVAL_MS;
    void options.deviceId;
  }
}

export { HybridNowPlayingSource } from './hybrid-now-playing-source.js';
