import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPersonalizedTrackProfile } from './personalization-engine.js';
import type { LearningEvent } from './personalization-types.js';

const events: LearningEvent[] = [
  {
    eventId: '1', deviceId: 'device-1', eventType: 'track_played', trackId: 'a', occurredAt: '2026-01-01T00:00:00Z',
    bpm: 124, energy: 0.72, genre: 'Afro House', key: '8A', artist: 'Artist A',
  },
  {
    eventId: '2', deviceId: 'device-1', eventType: 'recommendation_accepted', trackId: 'b', occurredAt: '2026-01-01T00:01:00Z',
    bpm: 126, energy: 0.78, genre: 'Afro House', key: '8A', artist: 'Artist A',
  },
  {
    eventId: '3', deviceId: 'device-1', eventType: 'track_rated', trackId: 'c', occurredAt: '2026-01-01T00:02:00Z',
    bpm: 128, energy: 0.81, genre: 'Afro House', key: '9A', artist: 'Artist B', rating: 5,
  },
  {
    eventId: '4', deviceId: 'device-1', eventType: 'track_skipped', trackId: 'd', occurredAt: '2026-01-01T00:03:00Z',
    bpm: 95, energy: 0.35, genre: 'Techno', key: '4A', artist: 'Artist C',
  },
];

test('personalization produces a deterministic profile', () => {
  const first = buildPersonalizedTrackProfile('device-1', events, '2026-01-01T01:00:00Z');
  const second = buildPersonalizedTrackProfile('device-1', [...events].reverse(), '2026-01-01T01:00:00Z');
  assert.deepEqual(first, second);
});

test('personalization learns positive and negative preferences', () => {
  const profile = buildPersonalizedTrackProfile('device-1', events, '2026-01-01T01:00:00Z');
  assert.ok(profile.profile.preferredGenres.includes('afro house'));
  assert.ok(profile.profile.avoidedGenres.includes('techno'));
  assert.ok(profile.profile.preferredArtists.includes('artist a'));
  assert.ok(profile.profile.avoidedArtists.includes('artist c'));
  assert.equal(profile.profile.preferredBpmMin, 125);
  assert.equal(profile.profile.preferredBpmMax, 127);
});

test('personalization ignores events belonging to other devices', () => {
  const profile = buildPersonalizedTrackProfile(
    'device-1',
    [...events, { ...events[0]!, eventId: 'foreign', deviceId: 'device-2', genre: 'Jazz' }],
    '2026-01-01T01:00:00Z',
  );
  assert.equal(profile.evidence.totalEvents, 4);
  assert.ok(!profile.profile.preferredGenres.includes('jazz'));
});

test('personalization requires a device id', () => {
  assert.throws(() => buildPersonalizedTrackProfile('   ', events), /device id/);
});
