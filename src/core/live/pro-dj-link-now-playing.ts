import dgram from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';
import type { LiveNowPlaying, NowPlayingSourcePort } from './now-playing-port.js';

export const PRO_DJ_LINK_MAGIC = Buffer.from('5173707431576d4a4f4c', 'hex');
export const PRO_DJ_LINK_ANNOUNCE_PORT = 50000;
export const PRO_DJ_LINK_BEAT_PORT = 50001;
export const PRO_DJ_LINK_STATUS_PORT = 50002;

export interface ProDjLinkStatus {
  deviceNumber: number;
  trackId: number;
  sourcePlayer: number;
  sourceSlot: number;
  trackType: number;
  playing: boolean;
  master: boolean;
  sync: boolean;
  onAir: boolean;
  bpm: number | null;
  pitchRaw: number | null;
  beat: number | null;
  beatInBar: number | null;
  observedAt: string;
}

export interface ProDjLinkPosition {
  deviceNumber: number;
  trackLengthSeconds: number;
  playbackPositionMs: number;
  pitchRaw: number;
  bpm: number | null;
  observedAt: string;
}

export interface ProDjLinkNowPlayingOptions {
  readonly deviceName?: string;
  readonly bindAddress?: string;
  readonly announceIntervalMs?: number;
  readonly staleAfterMs?: number;
  readonly now?: () => number;
  readonly socketFactory?: () => dgram.Socket;
}

interface DeviceState {
  readonly status: ProDjLinkStatus;
  readonly position: ProDjLinkPosition | null;
  readonly address: string | null;
}

function hasMagic(packet: Buffer): boolean {
  return packet.length >= 11 && packet.subarray(0, 10).equals(PRO_DJ_LINK_MAGIC);
}

function u16(packet: Buffer, offset: number): number | null {
  return packet.length >= offset + 2 ? packet.readUInt16BE(offset) : null;
}

function u32(packet: Buffer, offset: number): number | null {
  return packet.length >= offset + 4 ? packet.readUInt32BE(offset) : null;
}

function i32(packet: Buffer, offset: number): number | null {
  return packet.length >= offset + 4 ? packet.readInt32BE(offset) : null;
}

function typeOf(packet: Buffer): number | null {
  return hasMagic(packet) ? packet[10] ?? null : null;
}

export function decodeCdjStatusPacket(packet: Buffer, observedAt = new Date().toISOString()): ProDjLinkStatus | null {
  if (!hasMagic(packet) || typeOf(packet) !== 0x0a || packet.length < 0x94) return null;
  const flags = packet[0x89] ?? 0;
  const deviceNumber = packet[0x21];
  const trackId = u32(packet, 0x2c);
  const bpmRaw = u16(packet, 0x92);
  const pitchRaw = packet.length >= 0x90 ? ((packet[0x8d] ?? 0) << 16) | ((packet[0x8e] ?? 0) << 8) | (packet[0x8f] ?? 0) : null;
  if (deviceNumber == null || trackId == null || bpmRaw == null) return null;
  return {
    deviceNumber,
    trackId,
    sourcePlayer: packet[0x28] ?? 0,
    sourceSlot: packet[0x29] ?? 0,
    trackType: packet[0x2a] ?? 0,
    playing: (flags & 0x40) !== 0,
    master: (flags & 0x20) !== 0,
    sync: (flags & 0x10) !== 0,
    onAir: (flags & 0x08) !== 0,
    bpm: bpmRaw === 0xffff ? null : bpmRaw / 100,
    pitchRaw,
    beat: u32(packet, 0xa0),
    beatInBar: packet[0xa6] ?? null,
    observedAt,
  };
}

export function decodePrecisePositionPacket(packet: Buffer, observedAt = new Date().toISOString()): ProDjLinkPosition | null {
  if (!hasMagic(packet) || typeOf(packet) !== 0x0b || packet.length < 0x3c) return null;
  const deviceNumber = packet[0x21];
  const trackLengthSeconds = u32(packet, 0x24);
  const playbackPositionMs = u32(packet, 0x28);
  const pitchRaw = i32(packet, 0x2c);
  const bpmRaw = u32(packet, 0x38);
  if (deviceNumber == null || trackLengthSeconds == null || playbackPositionMs == null || pitchRaw == null || bpmRaw == null) return null;
  return {
    deviceNumber,
    trackLengthSeconds,
    playbackPositionMs,
    pitchRaw,
    bpm: bpmRaw === 0xffffffff ? null : bpmRaw / 100,
    observedAt,
  };
}

export function chooseLiveDevice(states: readonly DeviceState[]): DeviceState | null {
  if (states.length === 0) return null;
  return [...states].sort((a, b) => {
    const score = (s: DeviceState): number =>
      (s.status.playing ? 8 : 0) +
      (s.status.onAir ? 4 : 0) +
      (s.status.master ? 2 : 0) +
      (s.position ? 1 : 0);
    return score(b) - score(a) || b.status.observedAt.localeCompare(a.status.observedAt);
  })[0] ?? null;
}

function buildRekordboxStatusRequest(deviceName: string): Buffer {
  const name = Buffer.alloc(20);
  Buffer.from(deviceName.slice(0, 20), 'ascii').copy(name);
  return Buffer.concat([
    PRO_DJ_LINK_MAGIC,
    Buffer.from([0x11]),
    name,
    Buffer.from([0x01, 0x01, 0x17, 0x01, 0x04, 0x17, 0x01, 0x00, 0x00, 0x00]),
    Buffer.from(deviceName.slice(0, 20), 'utf16le'),
  ]).subarray(0, 64);
}

export class ProDjLinkNowPlayingSource implements NowPlayingSourcePort {
  public readonly name = 'ProDjLinkNowPlayingSource';
  public readonly sourceType = 'rekordbox_active_cue_polling' as const;

  private readonly options: Required<Pick<ProDjLinkNowPlayingOptions, 'deviceName' | 'bindAddress' | 'announceIntervalMs' | 'staleAfterMs'>> & Pick<ProDjLinkNowPlayingOptions, 'now' | 'socketFactory'>;
  private readonly states = new Map<number, DeviceState>();
  private readonly listeners = new Set<(nowPlaying: LiveNowPlaying | null) => void>();
  private socket: dgram.Socket | null = null;
  private discoverySocket: dgram.Socket | null = null;
  private announceTimer: NodeJS.Timeout | null = null;
  private running = false;
  private bound = false;

  public constructor(options: ProDjLinkNowPlayingOptions = {}) {
    this.options = {
      deviceName: options.deviceName ?? 'dj-sync-agent',
      bindAddress: options.bindAddress ?? '0.0.0.0',
      announceIntervalMs: options.announceIntervalMs ?? 1_500,
      staleAfterMs: options.staleAfterMs ?? 5_000,
      ...(options.now ? { now: options.now } : {}),
      ...(options.socketFactory ? { socketFactory: options.socketFactory } : {}),
    };
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.socket = this.options.socketFactory?.() ?? dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('message', (packet, remote) => this.handlePacket(packet, remote));
    this.socket.on('error', () => undefined);
    this.discoverySocket = this.options.socketFactory?.() ?? dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.discoverySocket.on('message', (packet, remote) => this.handleDiscoveryPacket(packet, remote));
    this.discoverySocket.on('error', () => undefined);
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket;
      if (!socket) return reject(new Error('PRO DJ LINK socket unavailable'));
      const onError = (error: Error): void => {
        socket.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        socket.off('error', onError);
        this.bound = true;
        resolve();
      };
      socket.once('error', onError);
      socket.once('listening', onListening);
      socket.bind(PRO_DJ_LINK_STATUS_PORT, this.options.bindAddress);
    });
    await new Promise<void>((resolve, reject) => {
      const socket = this.discoverySocket;
      if (!socket) return reject(new Error('PRO DJ LINK discovery socket unavailable'));
      const onError = (error: Error): void => {
        socket.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        socket.off('error', onError);
        resolve();
      };
      socket.once('error', onError);
      socket.once('listening', onListening);
      socket.bind(PRO_DJ_LINK_ANNOUNCE_PORT, this.options.bindAddress);
    });
    this.announceTimer = setInterval(() => this.requestDeviceStatus(), this.options.announceIntervalMs);
    this.requestDeviceStatus();
  }

  public async getCurrent(): Promise<LiveNowPlaying | null> {
    if (!this.running) await this.start();
    const now = this.options.now?.() ?? Date.now();
    const fresh = [...this.states.values()].filter((state) => {
      const observed = Date.parse(state.status.observedAt);
      return Number.isFinite(observed) && now - observed <= this.options.staleAfterMs;
    });
    const selected = chooseLiveDevice(fresh);
    if (!selected) return null;
    const status = selected.status;
    const position = selected.position;
    const observedAt = status.observedAt;
    return {
      trackId: String(status.trackId),
      title: null,
      artist: null,
      bpm: position?.bpm ?? status.bpm,
      musicalKey: null,
      startPlaybackAt: status.playing && position ? new Date(Date.parse(observedAt) - position.playbackPositionMs).toISOString() : null,
      elapsedMs: position?.playbackPositionMs ?? 0,
      durationMs: position ? position.trackLengthSeconds * 1000 : null,
      energyHint01: null,
      sourceType: this.sourceType,
      observedAt,
    };
  }

  public subscribe(listener: (nowPlaying: LiveNowPlaying | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async close(): Promise<void> {
    this.running = false;
    this.bound = false;
    if (this.announceTimer) clearInterval(this.announceTimer);
    this.announceTimer = null;
    const socket = this.socket;
    const discoverySocket = this.discoverySocket;
    this.socket = null;
    this.discoverySocket = null;
    this.states.clear();
    if (socket) await new Promise<void>((resolve) => socket.close(() => resolve()));
    if (discoverySocket) await new Promise<void>((resolve) => discoverySocket.close(() => resolve()));
  }

  private handleDiscoveryPacket(packet: Buffer, remote: RemoteInfo): void {
    if (!hasMagic(packet) || typeOf(packet) !== 0x06 || packet.length < 0x25) return;
    const deviceNumber = packet[0x24];
    if (deviceNumber == null || deviceNumber >= 33) return;
    for (const state of this.states.values()) {
      if (state.status.deviceNumber === deviceNumber && state.address !== remote.address) {
        this.states.set(deviceNumber, { ...state, address: remote.address });
        return;
      }
    }
    const existing = this.states.get(deviceNumber);
    if (existing) this.states.set(deviceNumber, { ...existing, address: remote.address });
  }

  private handlePacket(packet: Buffer, remote: RemoteInfo): void {
    const observedAt = new Date(this.options.now?.() ?? Date.now()).toISOString();
    const status = decodeCdjStatusPacket(packet, observedAt);
    if (status) {
      const previous = this.states.get(status.deviceNumber);
      this.states.set(status.deviceNumber, { status, position: previous?.position ?? null, address: remote.address });
      this.emit();
      return;
    }
    const position = decodePrecisePositionPacket(packet, observedAt);
    if (position) {
      const previous = this.states.get(position.deviceNumber);
      if (previous) {
        this.states.set(position.deviceNumber, { ...previous, position, address: remote.address });
        this.emit();
      }
    }
  }

  private requestDeviceStatus(): void {
    if (!this.socket || !this.bound) return;
    const packet = buildRekordboxStatusRequest(this.options.deviceName);
    for (const state of this.states.values()) {
      if (!state.address) continue;
      this.socket.send(packet, PRO_DJ_LINK_STATUS_PORT, state.address);
    }
    this.socket.setBroadcast?.(true);
  }

  private emit(): void {
    void this.getCurrent().then((current) => {
      for (const listener of this.listeners) listener(current);
    });
  }
}
