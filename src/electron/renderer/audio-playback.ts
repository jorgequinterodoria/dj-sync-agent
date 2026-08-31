export interface AudioPlaybackTrack {
  readonly id: string;
  readonly title?: string | null;
  readonly artist?: string | null;
  readonly path?: string | null;
  readonly durationMs?: number | null;
}

export function toFileAudioUrl(filePath: string): string {
  const value = filePath.trim();
  if (!value) return '';
  if (/^file:\/\//i.test(value)) return value;
  const normalized = value.replace(/\\/g, '/');
  const hasLeadingSlash = normalized.startsWith('/');
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const first = segments[0] ?? '';
  const winDriveLetter = first.length > 0 && /^[A-Za-z]:$/.test(first);
  if (hasLeadingSlash || winDriveLetter) {
    return `file:///${encoded}`;
  }
  return `file://${encoded}`;
}


export interface AudioPlaybackTrackSelection {
  readonly identity?: { readonly id?: unknown };
  readonly primaryFile?: { readonly localPath?: unknown; readonly path?: unknown };
}

export function resolveSelectedAudioPath(detail: AudioPlaybackTrackSelection): { readonly id: string; readonly path: string } | null {
  const id = typeof detail.identity?.id === 'string' ? detail.identity.id.trim() : '';
  if (!id) return null;
  const localPath = typeof detail.primaryFile?.localPath === 'string' ? detail.primaryFile.localPath.trim() : '';
  const path = typeof detail.primaryFile?.path === 'string' ? detail.primaryFile.path.trim() : '';
  const resolved = localPath || path;
  return resolved ? { id, path: resolved } : null;
}

export interface AudioPlaybackControllerOptions {
  readonly audio: HTMLAudioElement;
  readonly onState?: (state: { readonly playing: boolean; readonly currentTime: number; readonly duration: number | null }) => void;
  readonly onError?: (detail: { readonly code: number | null; readonly message: string | null; readonly src: string }) => void;
}

export class AudioPlaybackController {
  private readonly audio: HTMLAudioElement;
  private readonly onState?: AudioPlaybackControllerOptions['onState'];
  private readonly onError?: AudioPlaybackControllerOptions['onError'];
  private currentTrackId: string | null = null;
  private loadSeq = 0;

  constructor(options: AudioPlaybackControllerOptions) {
    this.audio = options.audio;
    this.onState = options.onState;
    this.onError = options.onError;
    this.audio.addEventListener('play', () => this.emit());
    this.audio.addEventListener('pause', () => this.emit());
    this.audio.addEventListener('timeupdate', () => this.emit());
    this.audio.addEventListener('loadedmetadata', () => this.emit());
    this.audio.addEventListener('ended', () => this.emit());
    this.audio.addEventListener('error', () => {
      const mediaError = this.audio.error;
      const detail = {
        code: mediaError ? mediaError.code : null,
        message: mediaError ? mediaError.message : null,
        src: this.audio.src,
      };
      // eslint-disable-next-line no-console
      console.error('[audio-playback] HTMLAudioElement error:', {
        code: detail.code,
        message: detail.message,
        src: detail.src,
        MEDIA_ERR_ABORTED: 1,
        MEDIA_ERR_NETWORK: 2,
        MEDIA_ERR_DECODE: 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
      });
      this.onError?.(detail);
      this.emit();
    });
    this.audio.preload = 'auto';
  }

  public get trackId(): string | null { return this.currentTrackId; }

  public async load(track: AudioPlaybackTrack, autoplay = true): Promise<boolean> {
    const path = track.path?.trim() ?? '';
    if (!path) {
      // eslint-disable-next-line no-console
      console.warn('[audio-playback] load called with empty path', { id: track.id });
      return false;
    }
    const src = toFileAudioUrl(path);
    if (!src) {
      // eslint-disable-next-line no-console
      console.warn('[audio-playback] toFileAudioUrl returned empty for path', { id: track.id, path });
      return false;
    }
    const seq = ++this.loadSeq;
    this.currentTrackId = track.id;
    try {
      if (!this.audio.paused) {
        this.audio.pause();
      }
    } catch {
      // no-op
    }
    this.audio.src = src;
    this.audio.load();
    // eslint-disable-next-line no-console
    console.log('[audio-playback] load assigned audio.src', { id: track.id, src, seq, autoplay });
    if (!autoplay) {
      this.emit();
      return true;
    }
    return this.playInternal(seq, track.id);
  }

  private async playInternal(seq: number, debugId: string): Promise<boolean> {
    if (this.loadSeq !== seq) {
      // eslint-disable-next-line no-console
      console.warn('[audio-playback] playInternal aborted: seq mismatch', {
        expectedSeq: seq,
        currentSeq: this.loadSeq,
        id: debugId,
      });
      return false;
    }
    if (!this.audio.src) {
      // eslint-disable-next-line no-console
      console.warn('[audio-playback] playInternal aborted: empty audio.src', { id: debugId, seq });
      return false;
    }
    try {
      await this.audio.play();
      if (this.loadSeq !== seq) {
        // eslint-disable-next-line no-console
        console.warn('[audio-playback] play() resolved but load already changed: stopping', {
          expectedSeq: seq,
          currentSeq: this.loadSeq,
          id: debugId,
        });
        try { this.audio.pause(); } catch { /* no-op */ }
        return false;
      }
      this.emit();
      return true;
    } catch (error) {
      if (this.loadSeq !== seq && (error instanceof Error && /abort|interrupt/i.test(error.name + (error.message || '')))) {
        // eslint-disable-next-line no-console
        console.warn('[audio-playback] play() aborted by newer load (expected):', {
          expectedSeq: seq,
          currentSeq: this.loadSeq,
          id: debugId,
        });
        return false;
      }
      // eslint-disable-next-line no-console
      console.error('[audio-playback] play() failed:', {
        name: error instanceof Error ? error.name : String(error),
        message: error instanceof Error ? error.message : String(error),
        src: this.audio.src,
        id: debugId,
        seq,
      });
      this.emit();
      return false;
    }
  }

  public async toggle(): Promise<boolean> {
    if (this.audio.paused) {
      const seq = this.loadSeq;
      const id = this.currentTrackId;
      if (!this.audio.src) {
        // eslint-disable-next-line no-console
        console.warn('[audio-playback] toggle play aborted: no audio.src loaded', {
          id,
          paused: this.audio.paused,
        });
        return false;
      }
      return this.playInternal(seq, id ?? 'toggle-no-id');
    }
    try {
      this.audio.pause();
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[audio-playback] toggle pause failed:', {
        name: error instanceof Error ? error.name : String(error),
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public pause(): void { this.audio.pause(); }

  public setVolume(percent: number): void {
    const normalized = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    this.audio.volume = normalized / 100;
  }

  public seek(percent: number): void {
    if (!Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
    const normalized = Math.max(0, Math.min(100, percent));
    this.audio.currentTime = (normalized / 100) * this.audio.duration;
  }

  private emit(): void {
    this.onState?.({
      playing: !this.audio.paused,
      currentTime: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : null,
    });
  }
}
