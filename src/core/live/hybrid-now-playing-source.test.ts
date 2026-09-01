import assert from 'node:assert/strict';
import test from 'node:test';
import { HybridNowPlayingSource } from './hybrid-now-playing-source.js';
import type { LiveNowPlaying, NowPlayingSourcePort } from './now-playing-port.js';
import { ManualNowPlayingSource } from './now-playing-port.js';

function live(trackId: string): LiveNowPlaying {
  return {
    trackId,
    title: trackId,
    artist: 'Artist',
    bpm: 124,
    musicalKey: '8A',
    startPlaybackAt: '2026-08-31T00:00:00.000Z',
    elapsedMs: 1000,
    durationMs: 300000,
    sourceType: 'rekordbox_active_cue_polling',
    observedAt: '2026-08-31T00:00:01.000Z',
  };
}

class FakePrimary implements NowPlayingSourcePort {
  public readonly name = 'FakePrimary';
  public readonly sourceType = 'rekordbox_active_cue_polling' as const;
  public current: LiveNowPlaying | null = null;
  public started = 0;
  public closed = 0;
  private listeners = new Set<(value: LiveNowPlaying | null) => void>();

  public async start(): Promise<void> { this.started += 1; }
  public async getCurrent(): Promise<LiveNowPlaying | null> { return this.current; }
  public subscribe(listener: (value: LiveNowPlaying | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  public publish(value: LiveNowPlaying | null): void { for (const listener of this.listeners) listener(value); }
  public async close(): Promise<void> { this.closed += 1; }
}

test('F68.1 primary Pro DJ Link state wins over manual fallback', async () => {
  const primary = new FakePrimary();
  primary.current = live('hardware-track');
  const fallback = new ManualNowPlayingSource();
  fallback.pushTrack({ trackId: 'manual-track', title: 'Manual' });
  const source = new HybridNowPlayingSource({ primary, fallback });

  const current = await source.getCurrent();
  assert.equal(current?.trackId, 'hardware-track');
  assert.equal(primary.started, 1);
  await source.close();
  assert.equal(primary.closed, 1);
});

test('F68.2 manual source is used when Pro DJ Link has no fresh state', async () => {
  const primary = new FakePrimary();
  const fallback = new ManualNowPlayingSource();
  fallback.pushTrack({ trackId: 'manual-track', title: 'Manual' });
  const source = new HybridNowPlayingSource({ primary, fallback });

  const current = await source.getCurrent();
  assert.equal(current?.trackId, 'manual-track');
  assert.equal(current?.sourceType, 'manual');
  await source.close();
});

test('F68.3 lifecycle subscribe/start/close is idempotent', async () => {
  const primary = new FakePrimary();
  const source = new HybridNowPlayingSource({ primary });
  const values: string[] = [];
  const unsubscribe = source.subscribe((value) => {
    if (value?.trackId) values.push(value.trackId);
  });
  await source.start();
  await source.start();
  assert.equal(primary.started, 1);
  primary.current = live('track-1');
  primary.publish(primary.current);
  assert.deepEqual(values, ['track-1']);
  unsubscribe();
  await source.close();
  assert.equal(primary.closed, 1);
});
