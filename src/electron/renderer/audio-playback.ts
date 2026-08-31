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
  const encoded = normalized
    .split('/')
    .map((segment, index) => index === 0 ? segment : encodeURIComponent(segment))
    .join('/');
  return `file://${encoded.startsWith('/') ? '' : '/'}${encoded}`;
}

export interface AudioPlaybackControllerOptions {
  readonly audio: HTMLAudioElement;
  readonly onState?: (state: { readonly playing: boolean; readonly currentTime: number; readonly duration: number | null }) => void;
}

export class AudioPlaybackController {
  private readonly audio: HTMLAudioElement;
  private readonly onState?: AudioPlaybackControllerOptions['onState'];
  private currentTrackId: string | null = null;

  constructor(options: AudioPlaybackControllerOptions) {
    this.audio = options.audio;
    this.onState = options.onState;
    this.audio.addEventListener('play', () => this.emit());
    this.audio.addEventListener('pause', () => this.emit());
    this.audio.addEventListener('timeupdate', () => this.emit());
    this.audio.addEventListener('loadedmetadata', () => this.emit());
    this.audio.addEventListener('ended', () => this.emit());
    this.audio.preload = 'auto';
  }

  public get trackId(): string | null { return this.currentTrackId; }

  public async load(track: AudioPlaybackTrack, autoplay = true): Promise<boolean> {
    const path = track.path?.trim() ?? '';
    if (!path) return false;
    const src = toFileAudioUrl(path);
    if (!src) return false;
    this.currentTrackId = track.id;
    this.audio.src = src;
    this.audio.load();
    if (!autoplay) {
      this.emit();
      return true;
    }
    try {
      await this.audio.play();
      this.emit();
      return true;
    } catch {
      this.emit();
      return false;
    }
  }

  public async toggle(): Promise<boolean> {
    if (this.audio.paused) {
      try {
        await this.audio.play();
        return true;
      } catch {
        return false;
      }
    }
    this.audio.pause();
    return true;
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
