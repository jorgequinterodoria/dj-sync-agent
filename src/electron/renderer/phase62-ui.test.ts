import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPhase62SetAnalysis,
  buildPhase62RecommendationContext,
  mapRecommendationForPhase62,
  normalizePhase62Filters,
} from './phase62-ui.js';

test('PHASE62: library filters normalize genre, BPM range, key and search', () => {
  assert.deepEqual(normalizePhase62Filters({
    search: '  Deep   House ',
    genre: 'Deep House',
    bpm: '123-128',
    key: '8A',
  }), {
    search: 'Deep House',
    genres: ['Deep House'],
    keys: ['8A'],
    bpmMin: 123,
    bpmMax: 128,
  });
  assert.equal(normalizePhase62Filters({ bpm: '129+' }).bpmMin, 129);
  assert.equal(normalizePhase62Filters({ bpm: 'BPM' }).bpmMin, null);
  assert.deepEqual(normalizePhase62Filters({ genre: 'Todos los géneros', key: 'Key', bpm: 'BPM' }), {
    search: '',
    genres: [],
    keys: [],
    bpmMin: null,
    bpmMax: null,
  });
});

test('PHASE62: recommendation mapping is bounded and deterministic', () => {
  assert.deepEqual(mapRecommendationForPhase62({
    trackId: 't1', title: ' Track ', artist: ' Artist ', bpm: 128, key: '8A', score: 1.4, confidence: -1,
    reasons: [{ detail: 'BPM compatible' }],
  }), {
    trackId: 't1', title: 'Track', artist: 'Artist', bpm: 128, key: '8A', score: 1, confidence: 0, reason: 'BPM compatible',
  });
});

test('PHASE62: set analysis calculates curve, BPM, artists, keys and warnings', () => {
  const result = buildPhase62SetAnalysis({
    energies: [4, 6, 8, null],
    bpms: [120, 124, 128],
    keys: ['8A', '8A', '9A', null],
    artists: ['A', 'A', 'B', null],
    warnings: ['Repeated artist'],
  });
  assert.equal(result.trackCount, 4);
  assert.equal(result.energyAverage, 6);
  assert.deepEqual(result.energyCurve, [4, 6, 8]);
  assert.equal(result.bpmMin, 120);
  assert.equal(result.bpmMax, 128);
  assert.equal(result.bpmAverage, 124);
  assert.equal(result.artistCount, 2);
  assert.equal(result.repeatedArtistCount, 1);
  assert.deepEqual(result.keyHistogram, [['8A', 2], ['9A', 1]]);
  assert.deepEqual(result.warnings, ['Repeated artist']);
});


test('PHASE62: recommendation context is real, bounded and excludes the current track', () => {
  const track = (trackId: string) => ({
    trackId, title: trackId, artist: 'Artist', genre: 'House', key: '8A',
    bpm: 126, energy: 0.7, rating: 4, playCount: 10,
  });
  assert.deepEqual(buildPhase62RecommendationContext({
    deviceId: ' d1 ',
    currentTrack: track('current'),
    candidates: [track('current'), track('next'), { ...track('third'), trackId: '  third  ' }],
    request: '  next track  ',
    limit: 99,
  }), {
    deviceId: 'd1',
    currentTrack: track('current'),
    candidates: [track('next'), { ...track('third'), trackId: 'third' }],
    request: 'next track',
    limit: 20,
  });
});
