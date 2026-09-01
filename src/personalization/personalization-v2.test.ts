import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePersonalizedCandidate } from './personalization-v2.js';
import type { PersonalizedTrackProfile } from './personalization-types.js';

const profile: PersonalizedTrackProfile = {
  schemaVersion: 1,
  engineVersion: '1.0.0',
  computedAt: '2026-08-31T00:00:00Z',
  deviceId: 'd1',
  profile: {
    preferredGenres: ['house'], avoidedGenres: ['techno'], preferredBpmMin: 124, preferredBpmMax: 128,
    preferredEnergyMin: 0.7, preferredEnergyMax: 0.85, preferredKeys: ['8a'], preferredArtists: ['artist a'], avoidedArtists: ['artist c'],
  },
  confidence: { genre: 90, bpm: 90, energy: 90, key: 80, artist: 90 },
  evidence: { totalEvents: 20, positiveEvents: 15, negativeEvents: 5 },
};

test('F67 personalization strongly favors matching profile', () => {
  const result = scorePersonalizedCandidate(profile, { trackId: 'x', genre: 'House', bpm: 126, energy: 0.78, key: '8A', artist: 'Artist A' });
  assert.ok(result.score > 0.95);
  assert.ok(result.confidence > 0.8);
});

test('F67 personalization penalizes avoided genre and artist', () => {
  const result = scorePersonalizedCandidate(profile, { trackId: 'x', genre: 'Techno', bpm: 126, energy: 0.78, key: '8A', artist: 'Artist C' });
  assert.ok(result.score < 0.5);
});

test('F67 personalization is deterministic and neutral without profile', () => {
  const candidate = { trackId: 'x', genre: 'House', bpm: 126 };
  assert.deepEqual(scorePersonalizedCandidate(undefined, candidate), scorePersonalizedCandidate(null, candidate));
  assert.equal(scorePersonalizedCandidate(undefined, candidate).confidence, 0);
});
