import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePcmMusicalIntelligenceV2 } from './audio-musical-intelligence-v2.js';

function tone(sampleRate: number, seconds: number, frequency: number, amplitude = 0.4): Float32Array {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

test('F66.1 musical intelligence V2 extracts deterministic PCM features', () => {
  const input = { samples: tone(44100, 2, 440), sampleRate: 44100 };
  const a = analyzePcmMusicalIntelligenceV2(input);
  const b = analyzePcmMusicalIntelligenceV2(input);
  assert.deepEqual(a, b);
  assert.ok(a.rms01 > 0);
  assert.ok(a.spectralCentroid01 > 0);
  assert.ok(a.confidence01 >= 0.99);
  assert.deepEqual(a.qualityFlags, ['pcm_quality_ok']);
});

test('F66.2 musical intelligence V2 detects silence and short/low-quality input', () => {
  const result = analyzePcmMusicalIntelligenceV2({ samples: new Float32Array(400), sampleRate: 8000 });
  assert.equal(result.rms01, 0);
  assert.ok(result.confidence01 < 0.4);
  assert.ok(result.qualityFlags.includes('short_window'));
  assert.ok(result.qualityFlags.includes('very_low_level'));
  assert.ok(result.qualityFlags.includes('low_sample_rate'));
});

test('F66.3 loud PCM is flagged as possible clipping', () => {
  const samples = tone(44100, 2, 1000, 1);
  const result = analyzePcmMusicalIntelligenceV2({ samples, sampleRate: 44100 });
  assert.ok(result.qualityFlags.includes('possible_clipping'));
});
