import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioPlaybackController, toFileAudioUrl } from './audio-playback.js';

class FakeAudio {
  public src = '';
  public paused = true;
  public volume = 1;
  public currentTime = 0;
  public duration = 120;
  private readonly listeners = new Map<string, Array<() => void>>();
  public loadCount = 0;

  addEventListener(name: string, listener: () => void): void {
    const list = this.listeners.get(name) ?? [];
    list.push(listener);
    this.listeners.set(name, list);
  }
  load(): void { this.loadCount += 1; }
  async play(): Promise<void> { this.paused = false; this.emit('play'); }
  pause(): void { this.paused = true; this.emit('pause'); }
  private emit(name: string): void { for (const listener of this.listeners.get(name) ?? []) listener(); }
}

test('PHASE63: local audio path becomes a file URL', () => {
  assert.equal(toFileAudioUrl('/Users/dj/My Music/track.mp3'), 'file:///Users/dj/My%20Music/track.mp3');
  assert.equal(toFileAudioUrl('file:///Users/dj/track.mp3'), 'file:///Users/dj/track.mp3');
  assert.equal(toFileAudioUrl('   '), '');
});

test('PHASE63: selecting a track loads and starts local playback', async () => {
  const audio = new FakeAudio();
  const controller = new AudioPlaybackController({ audio: audio as unknown as HTMLAudioElement });
  const played = await controller.load({ id: 't1', path: '/Users/dj/track one.mp3' });
  assert.equal(played, true);
  assert.equal(controller.trackId, 't1');
  assert.equal(audio.src, 'file:///Users/dj/track%20one.mp3');
  assert.equal(audio.loadCount, 1);
  assert.equal(audio.paused, false);
});

test('PHASE63: playback controls update volume and seek', async () => {
  const audio = new FakeAudio();
  const controller = new AudioPlaybackController({ audio: audio as unknown as HTMLAudioElement });
  await controller.load({ id: 't1', path: '/Users/dj/track.mp3' }, false);
  controller.setVolume(35);
  controller.seek(50);
  assert.equal(audio.volume, 0.35);
  assert.equal(audio.currentTime, 60);
  await controller.toggle();
  assert.equal(audio.paused, false);
  controller.pause();
  assert.equal(audio.paused, true);
});

test('PHASE63: track without local path is rejected safely', async () => {
  const audio = new FakeAudio();
  const controller = new AudioPlaybackController({ audio: audio as unknown as HTMLAudioElement });
  assert.equal(await controller.load({ id: 't1', path: null }), false);
  assert.equal(audio.src, '');
  assert.equal(audio.loadCount, 0);
});
