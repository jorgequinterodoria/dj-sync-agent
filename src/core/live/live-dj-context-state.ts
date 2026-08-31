import type {
  LiveNowPlaying,
  NowPlayingSourcePort,
} from './now-playing-port.js';
import {
  isNowPlayingValid,
} from './now-playing-port.js';
import type {
  ContextTag,
} from '../../intelligence/dj-intelligence-v2.js';
import {
  contextOfTag,
} from '../../intelligence/dj-intelligence-v2.js';

export type LiveSlot = 'next_up' | 'after_next' | 'cool_down';

export interface LiveEnergySnapshot {
  observedAt: string;
  energy01: number | null;
  trackId: string | null;
  elapsedMs: number;
}

export interface LiveDJContextCheckpoint {
  schemaVersion: 1;
  checkpointAt: string;
  sessionId: string;
  derivedContextTag: ContextTag;
  currentTrack: LiveNowPlaying | null;
  recentPlayedTrackIds: readonly string[];
  energyTimeline: readonly LiveEnergySnapshot[];
  slot: LiveSlot | null;
  playedTracksCount: number;
  elapsedSessionMs: number;
}

export interface LiveDJContextState {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly startedAt: string;
  readonly currentNowPlaying: LiveNowPlaying | null;
  readonly recentPlayedTrackIds: readonly string[];
  readonly recentPlayedAt: ReadonlyMap<string, string>;
  readonly energyTimeline: readonly LiveEnergySnapshot[];
  readonly derivedContextTag: ContextTag;
  readonly contextTagOverride: ContextTag | null;
  readonly currentSlot: LiveSlot | null;
  readonly playedTracksCount: number;
  readonly elapsedSessionMs: number;
  readonly lastCheckpointAt: string | null;
  readonly checkpointCount: number;
}

export interface LiveDJCheckpointPort {
  save(snapshot: LiveDJContextCheckpoint): Promise<void>;
  get(sessionId: string): Promise<LiveDJContextCheckpoint | null>;
  list(sessionId?: string, limit?: number): Promise<LiveDJContextCheckpoint[]>;
}

export class InMemoryLiveDJCheckpointStore implements LiveDJCheckpointPort {
  private readonly bySession = new Map<string, LiveDJContextCheckpoint[]>();

  public async save(snapshot: LiveDJContextCheckpoint): Promise<void> {
    const list = this.bySession.get(snapshot.sessionId) ?? [];
    list.push(snapshot);
    this.bySession.set(snapshot.sessionId, list);
  }

  public async get(sessionId: string): Promise<LiveDJContextCheckpoint | null> {
    const list = this.bySession.get(sessionId);
    if (!list || list.length === 0) return null;
    return list[list.length - 1] ?? null;
  }

  public async list(sessionId?: string, limit = 50): Promise<LiveDJContextCheckpoint[]> {
    if (sessionId) {
      const s = this.bySession.get(sessionId) ?? [];
      return s.slice(-limit);
    }
    const out: LiveDJContextCheckpoint[] = [];
    for (const arr of this.bySession.values()) out.push(...arr);
    return out.slice(-limit);
  }
}

export function deriveContextTagFromCurrentEnergy(
  currentEnergy01: number | null,
  playedTracksCount = 0,
  totalTracksTarget: number | null = null,
  elapsedSessionMs = 0,
  tagOverride: ContextTag | null = null,
): ContextTag {
  if (tagOverride) return tagOverride;
  if (playedTracksCount <= 1 || elapsedSessionMs < 2 * 60 * 1000) return 'opening';
  const e = currentEnergy01;
  if (e == null) return 'unknown';
  const clampedE = Math.max(0, Math.min(1, e));
  if (totalTracksTarget != null && playedTracksCount >= Math.max(0, totalTracksTarget - 2)) {
    return 'closing';
  }
  if (elapsedSessionMs >= 3 * 60 * 60 * 1000 && clampedE <= 0.45) {
    return 'afterhours';
  }
  if (clampedE <= 0.48) return 'warmup';
  if (clampedE >= 0.62) return 'peak';
  if (clampedE <= 0.58) return 'warmup';
  return 'peak';
}

export interface LiveDJContextServiceOptions {
  readonly recentTrackWindowSize?: number;
  readonly energyTimelineLimit?: number;
  readonly checkpointIntervalMs?: number;
  readonly tagOverride?: ContextTag | null;
  readonly totalTracksTarget?: number | null;
}

export const LIVE_DJ_CONTEXT_V1_DEFAULTS = {
  recentTrackWindowSize: 10,
  energyTimelineLimit: 240,
  checkpointIntervalMs: 30_000,
  tagOverride: null,
  totalTracksTarget: null,
} as const satisfies Required<LiveDJContextServiceOptions>;

export interface LiveDJContextSnapshotPublic extends LiveDJContextState {
  readonly checkpointDue: boolean;
  readonly nowPlayingTrackId: string | null;
  readonly bpmNow: number | null;
}

export class LiveDJContextService {
  private readonly source: NowPlayingSourcePort;
  private readonly checkpoints: LiveDJCheckpointPort | null;
  private readonly options: Required<LiveDJContextServiceOptions>;
  private state: LiveDJContextState;
  private msSinceLastCheckpoint = 0;

  constructor(args: {
    sessionId: string;
    deviceId: string;
    startedAt?: string;
    source: NowPlayingSourcePort;
    checkpoints?: LiveDJCheckpointPort | null;
    options?: LiveDJContextServiceOptions;
  }) {
    const startedAt = args.startedAt ?? new Date().toISOString();
    const mergedOpts = { ...LIVE_DJ_CONTEXT_V1_DEFAULTS, ...(args.options ?? {}) };
    this.source = args.source;
    this.checkpoints = args.checkpoints ?? null;
    this.options = mergedOpts;
    this.state = {
      sessionId: args.sessionId,
      deviceId: args.deviceId,
      startedAt,
      currentNowPlaying: null,
      recentPlayedTrackIds: Object.freeze([]),
      recentPlayedAt: new Map(),
      energyTimeline: Object.freeze([]),
      derivedContextTag: deriveContextTagFromCurrentEnergy(null, 0, mergedOpts.totalTracksTarget, 0, mergedOpts.tagOverride ?? null),
      contextTagOverride: mergedOpts.tagOverride ?? null,
      currentSlot: 'next_up',
      playedTracksCount: 0,
      elapsedSessionMs: 0,
      lastCheckpointAt: null,
      checkpointCount: 0,
    };
  }

  public getSnapshot(): LiveDJContextSnapshotPublic {
    const np = this.state.currentNowPlaying;
    return {
      ...this.state,
      checkpointDue: this.msSinceLastCheckpoint >= this.options.checkpointIntervalMs,
      nowPlayingTrackId: np?.trackId ?? null,
      bpmNow: np?.bpm ?? null,
    };
  }

  public setContextTagOverride(tag: ContextTag | null): void {
    this.state = { ...this.state, contextTagOverride: tag };
    this.recomputeDerivedContextTag();
  }

  public setCurrentSlot(slot: LiveSlot | null): void {
    this.state = { ...this.state, currentSlot: slot };
  }

  public appendPlayedTrack(trackId: string, playedAt?: string, durationPlayedMs?: number | null): void {
    const id = trackId.trim();
    if (!id) return;
    const when = playedAt ?? new Date().toISOString();
    const recent = [...this.state.recentPlayedTrackIds.filter(x => x !== id), id].slice(-this.options.recentTrackWindowSize);
    const playedAtMap = new Map(this.state.recentPlayedAt);
    playedAtMap.set(id, when);
    const count = this.state.playedTracksCount + 1;
    void durationPlayedMs;
    this.state = {
      ...this.state,
      recentPlayedTrackIds: Object.freeze(recent),
      recentPlayedAt: playedAtMap,
      playedTracksCount: count,
    };
    this.recomputeDerivedContextTag();
  }

  private recomputeDerivedContextTag(): void {
    const current = this.state.currentNowPlaying;
    const e = current?.energyHint01 ?? null;
    const derived = deriveContextTagFromCurrentEnergy(
      e,
      this.state.playedTracksCount,
      this.options.totalTracksTarget,
      this.state.elapsedSessionMs,
      this.state.contextTagOverride,
    );
    if (derived !== this.state.derivedContextTag) {
      this.state = { ...this.state, derivedContextTag: derived };
    }
  }

  public async tick(elapsedSinceLastTickMs: number, now?: string): Promise<LiveDJContextSnapshotPublic> {
    const dt = Math.max(0, Math.trunc(elapsedSinceLastTickMs));
    this.msSinceLastCheckpoint += dt;
    const observedAt = now ?? new Date().toISOString();
    const np = await this.source.getCurrent();
    this.state = { ...this.state, elapsedSessionMs: this.state.elapsedSessionMs + dt };
    if (isNowPlayingValid(np)) {
      if (!this.state.currentNowPlaying || this.state.currentNowPlaying.trackId !== np.trackId) {
        const prev = this.state.currentNowPlaying;
        if (prev && prev.trackId !== np.trackId && prev.trackId.trim().length > 0) {
          this.appendPlayedTrack(prev.trackId, np.startPlaybackAt ?? observedAt, Math.max(0, Math.min(prev.durationMs ?? 0, prev.elapsedMs)));
        }
      }
      const snap: LiveEnergySnapshot = {
        observedAt,
        energy01: np.energyHint01 ?? null,
        trackId: np.trackId,
        elapsedMs: Math.max(0, np.elapsedMs),
      };
      const timeline = [...this.state.energyTimeline, snap].slice(-this.options.energyTimelineLimit);
      this.state = {
        ...this.state,
        currentNowPlaying: np,
        energyTimeline: Object.freeze(timeline),
      };
    } else if (np && !this.state.currentNowPlaying) {
      this.state = { ...this.state, currentNowPlaying: np };
    }
    this.recomputeDerivedContextTag();
    if (this.msSinceLastCheckpoint >= this.options.checkpointIntervalMs) {
      await this.checkpoint(observedAt);
    }
    return this.getSnapshot();
  }

  public async checkpoint(now?: string): Promise<LiveDJContextCheckpoint> {
    const at = now ?? new Date().toISOString();
    const snapshot: LiveDJContextCheckpoint = {
      schemaVersion: 1,
      checkpointAt: at,
      sessionId: this.state.sessionId,
      derivedContextTag: this.state.derivedContextTag,
      currentTrack: this.state.currentNowPlaying,
      recentPlayedTrackIds: this.state.recentPlayedTrackIds,
      energyTimeline: this.state.energyTimeline,
      slot: this.state.currentSlot,
      playedTracksCount: this.state.playedTracksCount,
      elapsedSessionMs: this.state.elapsedSessionMs,
    };
    if (this.checkpoints) {
      await this.checkpoints.save(snapshot);
    }
    this.state = {
      ...this.state,
      lastCheckpointAt: at,
      checkpointCount: this.state.checkpointCount + 1,
    };
    this.msSinceLastCheckpoint = 0;
    return snapshot;
  }
}

export function parseContextTagFromInput(raw: unknown): ContextTag {
  if (typeof raw !== 'string') return 'unknown';
  return contextOfTag(raw);
}

export function deriveBpmRangeFromSlot(
  slot: LiveSlot,
  currentBpm: number | null,
): { minBpmDelta: number; maxBpmDelta: number } {
  if (!currentBpm) {
    if (slot === 'cool_down') return { minBpmDelta: -20, maxBpmDelta: -2 };
    return { minBpmDelta: -8, maxBpmDelta: +8 };
  }
  switch (slot) {
    case 'cool_down':
      return { minBpmDelta: -12, maxBpmDelta: -2 };
    case 'after_next':
      return { minBpmDelta: -10, maxBpmDelta: +10 };
    case 'next_up':
    default:
      return { minBpmDelta: -8, maxBpmDelta: +8 };
  }
}

export function deriveEnergyRangeFromSlot(
  slot: LiveSlot,
  currentEnergy01: number | null,
): { minEnergy01: number | null; maxEnergy01: number | null } {
  const cur = currentEnergy01 == null ? null : Math.max(0, Math.min(1, currentEnergy01));
  switch (slot) {
    case 'cool_down':
      return {
        minEnergy01: cur == null ? 0 : Math.max(0, cur - 0.25),
        maxEnergy01: cur == null ? 0.65 : Math.max(0, Math.min(1, cur - 0.02)),
      };
    case 'next_up':
      return {
        minEnergy01: cur == null ? 0.55 : Math.max(0, cur - 0.10),
        maxEnergy01: cur == null ? 1.0 : Math.min(1, cur + 0.12),
      };
    case 'after_next':
      return {
        minEnergy01: cur == null ? 0.5 : Math.max(0, cur - 0.15),
        maxEnergy01: cur == null ? 1.0 : Math.min(1, cur + 0.18),
      };
  }
}
