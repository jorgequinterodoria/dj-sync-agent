import assert from 'node:assert/strict';
import test from 'node:test';

import { createDJSyncPersonalizationService } from './dj-sync-personalization-service.js';
import type { LearningEvent } from '../personalization/personalization-types.js';

const event: LearningEvent = {
  eventId: '1', deviceId: 'device-1', eventType: 'track_played', trackId: '1', occurredAt: '2026-01-01T00:00:00Z',
  bpm: 124, energy: 0.7, genre: 'Afro House', key: '8A', artist: 'Artist A',
};

test('personalization service is disabled without a repository', () => {
  const service = createDJSyncPersonalizationService({ deviceId: 'device-1' });
  assert.equal(service.snapshot().status, 'disabled');
});

test('personalization service learns locally', () => {
  const service = createDJSyncPersonalizationService({ deviceId: 'device-1' });
  const profile = service.learn([event], '2026-01-01T01:00:00Z');
  assert.equal(profile.deviceId, 'device-1');
  assert.equal(service.snapshot().lastEventCount, 1);
});

test('personalization service refreshes and persists', async () => {
  let saved: unknown = null;
  const service = createDJSyncPersonalizationService({
    deviceId: 'device-1',
    repository: {
      async listEvents() { return [event]; },
      async saveProfile(profile) { saved = profile; },
    },
  });
  const profile = await service.refresh('2026-01-01T01:00:00Z');
  assert.equal(profile.evidence.totalEvents, 1);
  assert.ok(saved);
});
