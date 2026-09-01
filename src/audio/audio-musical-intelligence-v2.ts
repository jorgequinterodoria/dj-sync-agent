export interface PcmAnalysisInput {
  readonly samples: Float32Array;
  readonly sampleRate: number;
}

export interface MusicalIntelligenceV2Result {
  readonly rms01: number;
  readonly dynamicRange01: number;
  readonly zeroCrossingRate01: number;
  readonly spectralCentroid01: number;
  readonly rhythmicDensity01: number;
  readonly energy01: number;
  readonly confidence01: number;
  readonly qualityFlags: readonly string[];
}

const FFT_SIZE = 2048;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function zeroCrossingRate(samples: Float32Array): number {
  if (samples.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1] ?? 0;
    const current = samples[i] ?? 0;
    if ((previous < 0 && current >= 0) || (previous >= 0 && current < 0)) crossings += 1;
  }
  return crossings / (samples.length - 1);
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function spectralCentroid(samples: Float32Array, sampleRate: number): number {
  if (samples.length < 4 || sampleRate <= 0) return 0;
  const n = Math.min(FFT_SIZE, nextPowerOfTwo(samples.length));
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  const offset = Math.max(0, Math.floor((samples.length - n) / 2));

  for (let i = 0; i < n; i += 1) {
    const sample = samples[offset + i] ?? 0;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1));
    real[i] = sample * window;
  }

  // Deterministic radix-2 FFT, no runtime dependency.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j]!, real[i]!];
      [imag[i], imag[j]] = [imag[j]!, imag[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenR = Math.cos(angle);
    const wLenI = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j += 1) {
        const uR = real[i + j] ?? 0;
        const uI = imag[i + j] ?? 0;
        const vR = (real[i + j + half] ?? 0) * wr - (imag[i + j + half] ?? 0) * wi;
        const vI = (real[i + j + half] ?? 0) * wi + (imag[i + j + half] ?? 0) * wr;
        real[i + j] = uR + vR;
        imag[i + j] = uI + vI;
        real[i + j + half] = uR - vR;
        imag[i + j + half] = uI - vI;
        const nextWr = wr * wLenR - wi * wLenI;
        wi = wr * wLenI + wi * wLenR;
        wr = nextWr;
      }
    }
  }

  let weighted = 0;
  let magnitudeSum = 0;
  for (let bin = 1; bin < n / 2; bin += 1) {
    const magnitude = Math.hypot(real[bin] ?? 0, imag[bin] ?? 0);
    const frequency = (bin * sampleRate) / n;
    weighted += frequency * magnitude;
    magnitudeSum += magnitude;
  }
  return magnitudeSum > 0 ? weighted / magnitudeSum : 0;
}

export function analyzePcmMusicalIntelligenceV2(input: PcmAnalysisInput): MusicalIntelligenceV2Result {
  const { samples, sampleRate } = input;
  if (sampleRate <= 0 || samples.length === 0) {
    return {
      rms01: 0,
      dynamicRange01: 0,
      zeroCrossingRate01: 0,
      spectralCentroid01: 0,
      rhythmicDensity01: 0,
      energy01: 0,
      confidence01: 0,
      qualityFlags: ['insufficient_pcm'],
    };
  }

  const level = rms(samples);
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  let minRms = Number.POSITIVE_INFINITY;
  let maxRms = 0;
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.05));
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    const frame = samples.subarray(start, end);
    const frameRms = rms(frame);
    minRms = Math.min(minRms, frameRms);
    maxRms = Math.max(maxRms, frameRms);
  }
  const dynamicRange = maxRms > 0 && Number.isFinite(minRms) ? clamp01(1 - minRms / maxRms) : 0;
  const zcr = zeroCrossingRate(samples);
  const centroid = spectralCentroid(samples, sampleRate);
  const centroid01 = clamp01(centroid / Math.min(sampleRate / 2, 16000));
  const zcr01 = clamp01(zcr / 0.25);
  const rms01 = clamp01(level / 0.5);
  const rhythmicDensity = clamp01(0.55 * zcr01 + 0.45 * dynamicRange);
  const energy = clamp01(0.65 * rms01 + 0.2 * rhythmicDensity + 0.15 * centroid01);
  const confidence = clamp01(Math.min(1, samples.length / (sampleRate * 2)) * 0.7 + 0.3);

  const qualityFlags: string[] = [];
  if (samples.length < sampleRate) qualityFlags.push('short_window');
  if (level < 0.005) qualityFlags.push('very_low_level');
  if (peak >= 0.98) qualityFlags.push('possible_clipping');
  if (sampleRate < 44100) qualityFlags.push('low_sample_rate');
  if (qualityFlags.length === 0) qualityFlags.push('pcm_quality_ok');

  return {
    rms01: Math.round(rms01 * 10000) / 10000,
    dynamicRange01: Math.round(dynamicRange * 10000) / 10000,
    zeroCrossingRate01: Math.round(zcr01 * 10000) / 10000,
    spectralCentroid01: Math.round(centroid01 * 10000) / 10000,
    rhythmicDensity01: Math.round(rhythmicDensity * 10000) / 10000,
    energy01: Math.round(energy * 10000) / 10000,
    confidence01: Math.round(confidence * 10000) / 10000,
    qualityFlags,
  };
}
