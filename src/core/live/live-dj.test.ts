import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ManualNowPlayingSource,
  RekordboxActiveCuePollingSource,
  isNowPlayingValid,
  clampElapsed,
  emptyNowPlaying,
} from './now-playing-port.js';
import {
  LiveDJContextService,
  InMemoryLiveDJCheckpointStore,
  deriveContextTagFromCurrentEnergy,
  deriveBpmRangeFromSlot,
  deriveEnergyRangeFromSlot,
} from './live-dj-context-state.js';
import {
  buildLiveSlotConstraints,
  recommendLive,
  buildCurrentTrackCandidateFromLiveNowPlaying,
  mergeLiveRecommendationBatches,
} from './live-recommend.js';
import {
  buildPlannedEnergyCurve,
  expectedEnergyForProgress,
  averageEnergy01,
  LiveEnergyCurveTracker,
  milestoneSummaryText,
} from './live-energy-curve-tracker.js';

void test('F56.1 ManualNowPlayingSource pushTick valid elapsed + bpm energy', () => {
  const src = new ManualNowPlayingSource();
  const track = src.pushTrack({
    trackId: 't-123',
    bpm: 128,
    musicalKey: '8A',
    durationMs: 4 * 60 * 1000,
    energyHint01: 0.78,
    now: '2026-08-28T20:00:00.000Z',
  });
  assert.ok(isNowPlayingValid(track), 'pushTrack produce válido');
  assert.equal(track.bpm, 128);
  assert.equal(track.energyHint01, 0.78);
  assert.equal(track.elapsedMs, 0);
  const t = src.tickElapsed(90_000, '2026-08-28T20:01:30.000Z');
  assert.ok(t);
  assert.equal(t.elapsedMs, 90_000);
  const t2 = src.tickElapsed(4_000_000);
  assert.ok(t2);
  assert.equal(t2.elapsedMs, clampElapsed(90_000 + 4_000_000, 240_000));
});

void test('F56.2 RekordboxActiveCuePollingSource stub devuelve null sin masterDbPath (safe readonly)', async () => {
  const src = new RekordboxActiveCuePollingSource();
  assert.equal(src.masterDbPath, null);
  const curr = await src.getCurrent();
  assert.equal(curr, null);
  const withPath = new RekordboxActiveCuePollingSource({ masterDbPath: '/tmp/fake.db' });
  const curr2 = await withPath.getCurrent();
  assert.equal(curr2, null, 'stub retorna null hasta que activecue real sea implementado, sin writes');
});

void test('F57.1 LiveDJContext tick incrementa elapsed + played track count', async () => {
  const src = new ManualNowPlayingSource();
  const store = new InMemoryLiveDJCheckpointStore();
  const ctx = new LiveDJContextService({
    sessionId: 's-live-001',
    deviceId: 'dev',
    startedAt: '2026-08-28T21:00:00.000Z',
    source: src,
    checkpoints: store,
    options: { checkpointIntervalMs: 60_000 },
  });
  src.pushTrack({ trackId: 't-a', bpm: 122, durationMs: 240_000, energyHint01: 0.48, now: '2026-08-28T21:00:00.000Z' });
  await ctx.tick(240_000, '2026-08-28T21:04:00.000Z');
  src.pushTrack({ trackId: 't-b', bpm: 124, durationMs: 240_000, energyHint01: 0.6, now: '2026-08-28T21:04:00.000Z' });
  await ctx.tick(60_000, '2026-08-28T21:05:00.000Z');
  const snap = ctx.getSnapshot();
  assert.ok(snap.playedTracksCount >= 1, `playedTracksCount=${snap.playedTracksCount}`);
  assert.equal(snap.elapsedSessionMs, 240_000 + 60_000);
  assert.ok(snap.recentPlayedTrackIds.includes('t-a'), 't-a en recent');
});

void test('F57.2 LiveDJContext checkpoint manual se persiste en InMemory', async () => {
  const src = new ManualNowPlayingSource();
  const store = new InMemoryLiveDJCheckpointStore();
  const ctx = new LiveDJContextService({
    sessionId: 's-chk-01',
    deviceId: 'dev',
    source: src,
    checkpoints: store,
    options: { checkpointIntervalMs: 1_000_000 },
  });
  await ctx.checkpoint('2026-08-28T22:00:00.000Z');
  await ctx.checkpoint('2026-08-28T22:30:00.000Z');
  const snap = ctx.getSnapshot();
  assert.equal(snap.checkpointCount, 2);
  const last = await store.get('s-chk-01');
  assert.ok(last);
  assert.equal(last.sessionId, 's-chk-01');
  assert.equal(last.schemaVersion, 1);
});

void test('F57.3 deriveContextTagFromCurrentEnergy clasifica energía + target cierre', () => {
  const w = deriveContextTagFromCurrentEnergy(0.42, 5, null, 6 * 60 * 1000);
  assert.equal(w, 'warmup', '0.42 en sesión corta warmup');
  const p = deriveContextTagFromCurrentEnergy(0.86, 14, null, 2 * 60 * 60 * 1000);
  assert.equal(p, 'peak', '0.86 peak');
  const c = deriveContextTagFromCurrentEnergy(0.31, 28, 30, 2 * 60 * 60 * 1000);
  assert.equal(c, 'closing', 'alcanzó target-2 → closing sin importar energía');
});

void test('F58.1 recommendLive cool_down excluye high energy y selecciona <= actual-0.02', async () => {
  const src = new ManualNowPlayingSource();
  const store = new InMemoryLiveDJCheckpointStore();
  const ctx = new LiveDJContextService({ sessionId: 'r1', deviceId: 'd', source: src, checkpoints: store });
  src.pushTrack({ trackId: 't-now', bpm: 128, musicalKey: '9A', energyHint01: 0.86, durationMs: 240_000, now: '2026-08-28T23:00:00.000Z' });
  await ctx.tick(60_000, '2026-08-28T23:01:00.000Z');
  const snap = ctx.getSnapshot();
  const candidates: Array<{ trackId: string; bpm: number; energy: number; rating: number; playCount: number }> = [
    { trackId: 'too-high', bpm: 127, energy: 0.92, rating: 5, playCount: 15 },
    { trackId: 'ok-low', bpm: 125, energy: 0.63, rating: 5, playCount: 25 },
    { trackId: 'edge-high', bpm: 128, energy: 0.87, rating: 4, playCount: 5 },
    { trackId: 'ok-mid', bpm: 126, energy: 0.71, rating: 5, playCount: 30 },
  ];
  const res = recommendLive({
    ctx: snap,
    slot: 'cool_down',
    candidates,
    limit: 2,
    request: 'Cool down please',
  });
  assert.equal(res.candidateCount, 2, 'candidateCount tras filtro energy cool_down = 2 (out 2 high energy)');
  assert.ok(res.eligibleCount >= 1, `eligibleCount debe >=1 tras filtros cool_down, actual=${res.eligibleCount} appliedConstraints.minBpm=${String(res.appliedConstraints.minBpm)} appliedConstraints.maxBpm=${String(res.appliedConstraints.maxBpm)} appliedConstraints.targetEnergy=${String(res.appliedConstraints.targetEnergy)}`);
  assert.ok(res.recommendations.length >= 1, `recommendations length >=1, actual=${res.recommendations.length}`);
  function candidateEnergy(trackId: string): number | null {
    const f = candidates.find(c => c.trackId === trackId);
    return f ? f.energy : null;
  }
  const top = res.recommendations[0];
  assert.ok(top, 'top candidate presente');
  const topEnergy = candidateEnergy(top.trackId);
  for (const r of res.recommendations) {
    const e = candidateEnergy(r.trackId);
    if (typeof e === 'number') {
      assert.ok(e <= 0.84, `candidate ${r.trackId} energy ${String(e)} excede cool_down max 0.84`);
    }
  }
  assert.ok(typeof topEnergy === 'number' && topEnergy <= 0.84, 'top1 cool_down energy 0.63/0.71 bajo actual (top=' + String(topEnergy) + ')');
});

void test('F58.2 recommendLive next_up exclude recent tracks (recentTrackIdsForExclusion)', async () => {
  const src = new ManualNowPlayingSource();
  const ctx = new LiveDJContextService({ sessionId: 'r2', deviceId: 'd', source: src });
  src.pushTrack({ trackId: 't-now', bpm: 124, energyHint01: 0.7, durationMs: 240_000, now: '2026-08-28T23:30:00.000Z' });
  await ctx.tick(1_000, '2026-08-28T23:30:01.000Z');
  const snap = ctx.getSnapshot();
  const candidates = [
    { trackId: 'recent-repeat', bpm: 125, energy: 0.71, rating: 5, playCount: 20 },
    { trackId: 'fresh-1', bpm: 123, energy: 0.69, rating: 5, playCount: 20 },
    { trackId: 'fresh-2', bpm: 126, energy: 0.72, rating: 5, playCount: 30 },
  ];
  const res = recommendLive({
    ctx: snap,
    slot: 'next_up',
    candidates,
    recentTrackIdsForExclusion: ['recent-repeat'],
    limit: 3,
  });
  const ids = res.recommendations.map(r => r.trackId);
  assert.ok(!ids.includes('recent-repeat'), 'recent excluded track NO aparece ids=' + JSON.stringify(ids) + ' candidateCount=' + res.candidateCount + ' eligibleCount=' + res.eligibleCount + ' appliedConstraints=' + JSON.stringify(res.appliedConstraints));
  assert.ok(ids.length >= 2, 'fresh tracks 2 top length=' + ids.length + ' candidateCount=' + res.candidateCount + ' eligibleCount=' + res.eligibleCount);
  const merged = mergeLiveRecommendationBatches(res, null, null);
  assert.equal(merged.distinctTrackCount, ids.length, 'merge distinct track ok');
});

void test('F59.1 buildPlannedEnergyCurve 60min progress stages + average', () => {
  const curve = buildPlannedEnergyCurve({ totalDurationMinutes: 60, samples: 32 });
  assert.ok(curve.length >= 20);
  assert.equal(curve[0]?.stage, 'opening');
  const midIdx = Math.floor(curve.length * 0.55);
  const stages = new Set(curve.map(p => p.stage));
  assert.ok(stages.has('peak'), 'tiene peak stage');
  assert.ok(stages.has('cooldown') || stages.has('closing'), 'tiene cooldown/closing al final');
  void midIdx;
  const avg = averageEnergy01([
    { observedAt: '1', energy01: 0.6, trackId: 't1', elapsedMs: 0 },
    { observedAt: '2', energy01: 0.8, trackId: 't1', elapsedMs: 0 },
    { observedAt: '3', energy01: null, trackId: null, elapsedMs: 0 },
  ]);
  assert.equal(avg, (0.6 + 0.8) / 2, 'averageEnergy01 ignora null');
  const peakPoint = expectedEnergyForProgress(curve, 0.6);
  assert.ok(peakPoint, 'peakPoint');
  assert.ok(peakPoint.targetEnergy01 >= 0.7, `peak target >=0.7, actual ${peakPoint.targetEnergy01}`);
});

void test('F59.2 LiveEnergyCurveTracker milestones detecta warmup→peak', () => {
  const curve = buildPlannedEnergyCurve({ totalDurationMinutes: 60, samples: 32 });
  const tracker = new LiveEnergyCurveTracker({
    plannedCurve: curve,
    startedAt: '2026-08-28T19:00:00.000Z',
    totalDurationMinutes: 60,
    options: { warmupMinSamples: 3, peakMinSamples: 3, deviationWarningThreshold01: 0.25 },
  });
  const startedMs = Date.parse('2026-08-28T19:00:00.000Z');
  for (let i = 0; i < 3; i++) {
    const now = startedMs + i * 4 * 60 * 1000;
    tracker.appendSnapshot({ observedAt: new Date(now).toISOString(), energy01: 0.48 + i * 0.02, trackId: `w${i}`, elapsedMs: i * 20000 }, now);
  }
  let ms = startedMs + 15 * 60 * 1000;
  for (let i = 0; i < 12; i++) {
    const now = ms + i * 2 * 60 * 1000;
    tracker.appendSnapshot({ observedAt: new Date(now).toISOString(), energy01: 0.85, trackId: `p${i}`, elapsedMs: 0 }, now);
  }
  ms = startedMs + 50 * 60 * 1000;
  for (let i = 0; i < 4; i++) {
    const now = ms + i * 2 * 60 * 1000;
    tracker.appendSnapshot({ observedAt: new Date(now).toISOString(), energy01: 0.5, trackId: `c${i}`, elapsedMs: 0 }, now);
  }
  const milestones = tracker.getMilestones();
  assert.ok(milestones.warmupEndedAt, `warmupEndedAt presente:${String(milestones.warmupEndedAt)}`);
  assert.ok(milestones.peakStartedAt, `peakStartedAt presente:${String(milestones.peakStartedAt)}`);
  const summary = tracker.summarizeDeviation(startedMs + 40 * 60 * 1000);
  assert.ok(summary.actualAverageEnergy01 != null, 'actual average definido');
  const str = milestoneSummaryText(milestones);
  assert.ok(str.includes('stage:'), 'milestone text contiene stage');
});

void emptyNowPlaying;
void clampElapsed;
void deriveBpmRangeFromSlot;
void buildLiveSlotConstraints;
void buildCurrentTrackCandidateFromLiveNowPlaying;
