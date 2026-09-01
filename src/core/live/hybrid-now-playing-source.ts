import type { LiveNowPlaying, NowPlayingSourcePort } from './now-playing-port.js';
import { ManualNowPlayingSource } from './now-playing-port.js';
import { ProDjLinkNowPlayingSource, type ProDjLinkNowPlayingOptions } from './pro-dj-link-now-playing.js';

/**
 * Production boundary for live state.
 * PRO DJ LINK is authoritative when a fresh hardware state exists;
 * manual input remains an explicit local fallback for development and
 * environments without a connected player.
 */
export interface HybridNowPlayingSourceOptions extends ProDjLinkNowPlayingOptions {
  readonly primary?: NowPlayingSourcePort;
  readonly fallback?: ManualNowPlayingSource;
}

export class HybridNowPlayingSource implements NowPlayingSourcePort {
  public readonly name = 'HybridNowPlayingSource';
  public readonly sourceType = 'unknown' as const;

  private readonly primary: NowPlayingSourcePort;
  private readonly fallback: ManualNowPlayingSource;
  private readonly listeners = new Set<(nowPlaying: LiveNowPlaying | null) => void>();
  private unsubscribePrimary: (() => void) | null = null;
  private unsubscribeFallback: (() => void) | null = null;
  private started = false;

  public constructor(options: HybridNowPlayingSourceOptions = {}) {
    this.primary = options.primary ?? new ProDjLinkNowPlayingSource(options);
    this.fallback = options.fallback ?? new ManualNowPlayingSource();
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (typeof this.primary.subscribe === 'function') {
      this.unsubscribePrimary = this.primary.subscribe((value) => this.emit(value));
    }
    this.unsubscribeFallback = this.fallback.subscribe((value) => {
      void this.emitFallbackIfPrimaryUnavailable(value);
    });
    try {
      const start = (this.primary as NowPlayingSourcePort & { start?: () => Promise<void> }).start;
      if (typeof start === 'function') await start.call(this.primary);
    } catch {
      // Hardware/network availability is optional; fallback remains usable.
    }
  }

  public async getCurrent(): Promise<LiveNowPlaying | null> {
    await this.start();
    try {
      const primary = await this.primary.getCurrent();
      if (primary?.trackId?.trim()) return primary;
    } catch {
      // Fall through to explicit manual source.
    }
    return this.fallback.getCurrent();
  }

  public subscribe(listener: (nowPlaying: LiveNowPlaying | null) => void): () => void {
    this.listeners.add(listener);
    void this.start();
    return () => this.listeners.delete(listener);
  }

  public pushManualTrack(input: Parameters<ManualNowPlayingSource['pushTrack']>[0]): LiveNowPlaying {
    const result = this.fallback.pushTrack(input);
    if (!this.started) this.emit(result);
    return result;
  }

  public tickManualElapsed(addMs: number): LiveNowPlaying | null {
    const result = this.fallback.tickElapsed(addMs);
    if (result && !this.started) this.emit(result);
    return result;
  }

  public async close(): Promise<void> {
    this.started = false;
    this.unsubscribePrimary?.();
    this.unsubscribeFallback?.();
    this.unsubscribePrimary = null;
    this.unsubscribeFallback = null;
    await this.primary.close?.();
    // ManualNowPlayingSource no expone close()
    this.listeners.clear();
  }

  private emit(value: LiveNowPlaying | null): void {
    for (const listener of this.listeners) listener(value);
  }

  private async emitFallbackIfPrimaryUnavailable(value: LiveNowPlaying | null): Promise<void> {
    if (value == null) {
      this.emit(null);
      return;
    }
    try {
      const primary = await this.primary.getCurrent();
      if (primary?.trackId?.trim()) return;
    } catch {
      // Fallback is authoritative when primary is unavailable.
    }
    this.emit(value);
  }
}
