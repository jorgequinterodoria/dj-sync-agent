import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedTrack } from '../../rekordbox/normalized-track.js';
import type { ConversationConstraint, ConversationMessage, ConversationSnapshot } from '../../ai/memory/conversation-memory-types.js';
import { buildPersonalizedTrackProfile } from '../../personalization/personalization-engine.js';
import type { LearningEvent } from '../../personalization/personalization-types.js';
import { InMemoryCopilotDbStore } from './in-memory-store.js';
import {
  mergeDJTransitionRow,
  toDJPreferenceRowExplicit,
  toDJPreferenceRowImplicit,
  toDJSessionRow,
  toDJSessionTrackRow,
  toDJTransitionRowInitial,
  toRecommendationFeedbackRow,
  unpackDJBehaviorProfile,
  unpackDJSessionTrackFlags,
  toDJBehaviorProfileRow,
} from './codec.js';

type NormalizedTrackPartial = {
  identity?: Partial<NormalizedTrack['identity']>;
  metadata?: Partial<NormalizedTrack['metadata']>;
  technical?: Partial<NormalizedTrack['technical']>;
  primaryFile?: Partial<NormalizedTrack['primaryFile']>;
  playlists?: NormalizedTrack['playlists'];
};

function buildTrack(overrides: NormalizedTrackPartial = {}): NormalizedTrack {
  const id = overrides.identity?.id ?? crypto.randomUUID();
  return {
    schemaVersion: 1,
    identity: { id, uuid: overrides.identity?.uuid ?? id, ...overrides.identity },
    metadata: {
      title: 'T', artist: 'A', album: 'Alb', genre: 'Techno', label: 'L', key: '8A',
      remixer: null, composer: null, isrc: null,
      ...overrides.metadata,
    },
    technical: {
      bpmRaw: 120, bpm: 120, lengthSeconds: 300, bitrate: 320, bitDepth: 16, sampleRate: 44100,
      rating: 5, playCount: 10, fileType: 1, analyzed: 1,
      ...overrides.technical,
    },
    primaryFile: {
      id: 'pf', path: '/p.mp3', localPath: '/p.mp3', hash: 'h', size: 100, kind: 'media',
      ...overrides.primaryFile,
    },
    files: [], cues: [],
    playlists: overrides.playlists ?? [],
    sync: { rbLocalDeleted: null, rbLocalUsn: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

function messages(): ConversationMessage[] {
  return [
    { id: 'm1', role: 'user', content: 'hola', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'm2', role: 'assistant', content: 'qué tal', createdAt: '2026-01-01T00:00:01.000Z' },
  ];
}
function constraints(): ConversationConstraint[] {
  return [{ key: 'max_bpm', value: '128', source: 'user', createdAt: '2026-01-01T00:00:02.000Z' }];
}

void describe('PHASE43+44+45+46 — Bloque C codec roundtrip + store', () => {
  void it('DJSession + tracks codec roundtrip, flags packed JSON', () => {
    const session = toDJSessionRow({ sessionId: 's1', startedAt: '2026-06-01T22:00:00.000Z', source: 'live', contextTag: 'peak' });
    assert.equal(session.session_id, 's1');
    assert.equal(session.context_tag, 'peak');
    const track = toDJSessionTrackRow({ sessionId: 's1', position: 1, trackId: 't1', playedAt: '2026-06-01T22:05:00.000Z', durationPlayedMs: 180000, flags: { playedFull: true } });
    assert.equal(track.position, 1);
    assert.equal(track.duration_played_ms, 180000);
    const flags = unpackDJSessionTrackFlags(track);
    assert.equal(flags.playedFull, true);
  });

  void it('Transition codec: insert + merge increments frequency + rolling success_score', () => {
    const first = toDJTransitionRowInitial({ trackAId: 'a', trackBId: 'b', durationPlayedAMs: 60000, durationPlayedBMs: 90000, successScore: 0.85 });
    assert.equal(first.frequency, 1);
    assert.equal(first.success_score, 0.85);
    const second = mergeDJTransitionRow(first, { durationPlayedAMs: 70000, durationPlayedBMs: 80000, successScore: 0.5 });
    assert.equal(second.frequency, 2);
    assert.equal(second.avg_duration_played_a_ms, 65000);
    assert.equal(second.avg_duration_played_b_ms, 85000);
    assert.equal(second.success_score, 0.675);
  });

  void it('RecommendationFeedback + Preference codecs roundtrip types', () => {
    const feedback = toRecommendationFeedbackRow({ feedbackId: 'f-1', trackId: 't1', accepted: true, rankPosition: 2, addedToSet: true, contextTag: 'warmup' });
    assert.equal(feedback.rec_feedback_id, 'f-1');
    assert.equal(feedback.accepted, 1);
    assert.equal(feedback.added_to_set, 1);
    assert.equal(feedback.context_tag, 'warmup');
    const explicit = toDJPreferenceRowExplicit({ deviceId: 'd1', dimension: 'genre', value: 'Techno', kind: 'preferred' });
    assert.equal(explicit.dimension, 'genre');
    assert.equal(explicit.kind, 'preferred');
    assert.ok(explicit.weight > 0);
    const implicit = toDJPreferenceRowImplicit({ deviceId: 'd1', dimension: 'artist', value: 'ARTIST_B', positive: false });
    assert.equal(implicit.kind, 'avoided');
    assert.ok(implicit.weight < 0);
  });

  void it('BehaviorProfile codec RT (profile_json) + version keys', () => {
    const events: LearningEvent[] = [
      { eventId: 'e1', deviceId: 'd1', eventType: 'track_played', trackId: 't1', occurredAt: '2026-06-01T22:05:00.000Z', genre: 'Techno', bpm: 126, key: '8A', artist: 'ARTIST_A', rating: 5 },
      { eventId: 'e2', deviceId: 'd1', eventType: 'track_rated', trackId: 't2', occurredAt: '2026-06-01T22:10:00.000Z', genre: 'Techno', bpm: 128, rating: 5 },
      { eventId: 'e3', deviceId: 'd1', eventType: 'track_skipped', trackId: 't3', occurredAt: '2026-06-01T22:11:00.000Z', genre: 'House', artist: 'ARTIST_B' },
    ];
    const profile = buildPersonalizedTrackProfile('d1', events, '2026-06-01T22:20:00.000Z');
    assert.equal(profile.profile.preferredGenres[0], 'techno');
    const row = toDJBehaviorProfileRow({ deviceId: 'd1', profileVersion: 1, schemaVersion: 1, engineVersion: '1.0.0', profile });
    assert.equal(row.device_id, 'd1');
    assert.equal(row.profile_version, 1);
    const decoded = unpackDJBehaviorProfile(row);
    assert.deepEqual(decoded.profile.preferredGenres, profile.profile.preferredGenres);
    assert.deepEqual(decoded, profile);
  });

  void it('InMemoryCopilotDbStore: sessions + append tracks + transitions recorded + feedback list', async () => {
    const store = new InMemoryCopilotDbStore();
    const t1 = buildTrack({ identity: { id: 't1' } });
    const t2 = buildTrack({ identity: { id: 't2' } });
    const t3 = buildTrack({ identity: { id: 't3' } });
    await store.upsertTracks([t1, t2, t3]);

    await store.upsertSession({ sessionId: 's1', startedAt: '2026-06-01T22:00:00.000Z', source: 'live', contextTag: 'peak' });
    await store.appendSessionTrack({ sessionId: 's1', position: 1, trackId: 't1', playedAt: '2026-06-01T22:05:00.000Z', durationPlayedMs: 180000 });
    await store.appendSessionTrack({ sessionId: 's1', position: 2, trackId: 't2', playedAt: '2026-06-01T22:08:00.000Z', durationPlayedMs: 200000 });
    await store.appendSessionTrack({ sessionId: 's1', position: 3, trackId: 't3', playedAt: '2026-06-01T22:11:20.000Z', durationPlayedMs: 190000, flags: { skipped: false, playedFull: true } });
    await store.recordTransition({ trackAId: 't1', trackBId: 't2', durationPlayedAMs: 180000, durationPlayedBMs: 200000, successScore: 0.9 });
    await store.recordTransition({ trackAId: 't2', trackBId: 't3', durationPlayedAMs: 200000, durationPlayedBMs: 190000, successScore: 0.6 });
    await store.recordRecommendationFeedback({ feedbackId: 'fb-1', sessionId: 's1', trackId: 't3', accepted: true, rankPosition: 1, addedToSet: true, contextTag: 'peak' });
    await store.endSession('s1', '2026-06-01T23:00:00.000Z');

    const summary = await store.getSession('s1');
    assert.ok(summary);
    assert.equal(summary.session.session_id, 's1');
    assert.equal(summary.tracks.length, 3);
    assert.equal(summary.transitionCount, 2);
    assert.equal(summary.session.ended_at, '2026-06-01T23:00:00.000Z');

    const transitionsFor = await store.getTransitionsFor('t1');
    assert.equal(transitionsFor.length, 1);
    assert.equal(transitionsFor[0]!.track_b_id, 't2');
    assert.equal(transitionsFor[0]!.frequency, 1);

    const feedback = await store.listRecommendationFeedback({ sessionId: 's1', acceptedOnly: true });
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0]!.track_id, 't3');
  });

  void it('InMemoryCopilotDbStore: preferences explicit + implicit listValues/isExcluded/removeExplicit', async () => {
    const store = new InMemoryCopilotDbStore();
    await store.recordExplicit({ deviceId: 'd1', dimension: 'genre', value: 'Techno', kind: 'preferred', weight: 3, occurredAt: '2026-07-01' });
    await store.recordExplicit({ deviceId: 'd1', dimension: 'genre', value: 'House', kind: 'avoided' });
    await store.recordExplicit({ deviceId: 'd1', dimension: 'artist', value: 'ARTIST_FORBIDDEN', kind: 'excluded' });
    await store.recordImplicit({ deviceId: 'd1', dimension: 'genre', value: 'Techno', positive: true, weight: 2, occurredAt: '2026-08-01' });
    await store.recordImplicit({ deviceId: 'd1', dimension: 'genre', value: 'House', positive: false, weight: 1, occurredAt: '2026-08-02' });

    const genres = await store.listValues({ deviceId: 'd1', dimension: 'genre' });
    assert.equal(genres.length, 2);
    assert.equal(genres[0]!.value, 'techno');
    assert.equal(genres[0]!.totalWeight, 5);

    const excluded = await store.isExcluded({ deviceId: 'd1', dimension: 'artist', value: 'ARTIST_FORBIDDEN' });
    assert.equal(excluded, true);
    const notExcluded = await store.isExcluded({ deviceId: 'd1', dimension: 'genre', value: 'Techno' });
    assert.equal(notExcluded, false);

    await store.removeExplicit({ deviceId: 'd1', dimension: 'genre', value: 'Techno', kind: 'preferred' });
    const genresAfter = await store.listValues({ deviceId: 'd1', dimension: 'genre' });
    const technoRow = genresAfter.find((g) => g.value === 'techno');
    assert.equal(technoRow?.totalWeight, 2);
  });

  void it('InMemoryCopilotDbStore: behavior profile persist/get/getLatest + semver', async () => {
    const store = new InMemoryCopilotDbStore();
    const events: LearningEvent[] = [
      { eventId: 'e1', deviceId: 'd1', eventType: 'track_played', trackId: 't1', occurredAt: '2026-06-01', genre: 'Techno', bpm: 126, key: '8A', artist: 'ARTIST_A' },
    ];
    const p1 = buildPersonalizedTrackProfile('d1', events, '2026-06-01T00:00:00.000Z');
    await store.persistBehaviorProfile({ deviceId: 'd1', profileVersion: 1, schemaVersion: 1, engineVersion: '1.0.0', profile: p1 });
    const p1b = buildPersonalizedTrackProfile('d1', [
      ...events,
      { eventId: 'e2', deviceId: 'd1', eventType: 'recommendation_accepted', trackId: 't2', occurredAt: '2026-07-01', genre: 'Techno', artist: 'ARTIST_A' },
    ], '2026-07-01T00:00:00.000Z');
    await store.persistBehaviorProfile({ deviceId: 'd1', profileVersion: 2, schemaVersion: 1, engineVersion: '1.0.0', profile: p1b });

    const v1 = await store.getBehaviorProfile({ deviceId: 'd1', profileVersion: 1, schemaVersion: 1, engineVersion: '1.0.0' });
    assert.ok(v1);
    assert.equal(v1.evidence.totalEvents, 1);

    const latest = await store.getLatestBehaviorProfile('d1');
    assert.ok(latest);
    assert.equal(latest.evidence.totalEvents, 2);
  });

  void it('InMemoryCopilotDbStore.asConversationMemoryStore() save/load/delete snapshot RT', async () => {
    const store = new InMemoryCopilotDbStore();
    const snapshot: ConversationSnapshot = {
      schemaVersion: 1,
      conversationId: 'conv-1',
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:01.000Z',
      summary: null,
      messages: messages(),
      constraints: constraints(),
    };
    const adapter = store.asConversationMemoryStore();
    await adapter.save(snapshot);
    const loaded = await adapter.load('conv-1');
    assert.ok(loaded);
    assert.deepEqual(loaded, snapshot);
    await adapter.delete('conv-1');
    const gone = await adapter.load('conv-1');
    assert.equal(gone, null);
  });
});
