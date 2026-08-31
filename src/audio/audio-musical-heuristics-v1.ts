import type { MusicalAudioFeaturesResult } from './audio-boundaries.js';
import type { MusicalSectionV1, MusicalSectionType } from '../core/local-store/ports.js';

export interface MoodHeuristicInputs {
  bpm: number | null;
  musicalKey: string | null;
  rating: number | null;
  playCount: number | null;
  genre: string | null;
  durationSeconds: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface StructureHeuristicInputs {
  bpm: number | null;
  durationSeconds: number | null;
  energyHint01: number | null;
}

export function clamp01(x: number | null): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const c = Math.max(0, Math.min(1, x));
  return Math.round(c * 10000) / 10000;
}

export function isMinorCamelot(key: string | null): boolean | null {
  if (key == null) return null;
  const trimmed = key.trim();
  if (trimmed.length === 0) return null;
  const last = trimmed[trimmed.length - 1]!;
  if (last === 'A') return true;
  if (last === 'B') return false;
  return null;
}

export function analyzeMoodV1Deterministic(input: MoodHeuristicInputs): {
  energy: number | null;
  danceability: number | null;
  danceFloorIntensity: number | null;
  rhythmicDensity: number | null;
  moodTags: string[];
  vocalPresence: number | null;
  instrumentalProbability: number | null;
  qualityFlags: string[];
} {
  const moodTags: string[] = [];
  const qualityFlags: string[] = [];

  const bpm = typeof input.bpm === 'number' && Number.isFinite(input.bpm) && input.bpm > 40 && input.bpm < 220 ? input.bpm : null;
  const rating = typeof input.rating === 'number' && input.rating >= 0 && input.rating <= 5 ? input.rating : null;
  const playCount = typeof input.playCount === 'number' && input.playCount >= 0 ? Math.floor(input.playCount) : null;
  const genre = (input.genre ?? '').trim().toLowerCase();
  const duration = typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds) && input.durationSeconds > 0 ? input.durationSeconds : null;
  const bitrate = typeof input.bitrate === 'number' && Number.isFinite(input.bitrate) && input.bitrate > 0 ? input.bitrate : null;
  const sampleRate = typeof input.sampleRate === 'number' && Number.isFinite(input.sampleRate) && input.sampleRate > 0 ? input.sampleRate : null;
  const channels = typeof input.channels === 'number' && Number.isFinite(input.channels) && input.channels > 0 ? input.channels : null;

  // Energy
  let energySum = 0;
  let energyWeight = 0;
  if (bpm != null) {
    const bpmNorm = Math.max(0, Math.min(1, (bpm - 80) / 80)); // 80→0, 160→1
    energySum += bpmNorm * 0.55;
    energyWeight += 0.55;
  }
  if (rating != null) {
    energySum += (rating / 5) * 0.25;
    energyWeight += 0.25;
  }
  if (bitrate != null) {
    const bitrateNorm = Math.max(0, Math.min(1, bitrate / 500));
    energySum += bitrateNorm * 0.1;
    energyWeight += 0.1;
  }
  if (duration != null) {
    // Longer progressive tracks may hold energy but shorter intro edits sometimes high; neutral small effect
    const durationNorm = Math.max(0, Math.min(1, (duration - 120) / 420)); // 2min → 0, 9min → 1
    energySum += durationNorm * 0.1;
    energyWeight += 0.1;
  }
  const energy: number | null = energyWeight > 0 ? clamp01(energySum / energyWeight) ?? null : null;

  // Danceability & RhythmicDensity & DanceFloorIntensity
  let danceability: number | null = null;
  let rhythmicDensity: number | null = null;
  let danceFloorIntensity: number | null = null;
  if (bpm != null || rating != null) {
    let danceSum = 0;
    let danceWeight = 0;
    if (bpm != null) {
      const sweetSpot = Math.max(0, 1 - Math.abs(bpm - 126) / 16); // 110-142 sweet (peak 126)
      danceSum += sweetSpot * 0.5;
      danceWeight += 0.5;
    }
    if (rating != null) {
      danceSum += (rating / 5) * 0.3;
      danceWeight += 0.3;
    }
    if (energy != null) {
      danceSum += energy * 0.2;
      danceWeight += 0.2;
    }
    danceability = danceWeight > 0 ? clamp01(danceSum / danceWeight) ?? null : null;
    rhythmicDensity = danceability != null ? clamp01(0.8 * danceability + (sampleRate != null ? (sampleRate > 44100 ? 0.05 : 0) : 0)) : null;
    danceFloorIntensity = energy != null && danceability != null ? clamp01(0.6 * energy + 0.4 * danceability) : null;
  }

  // Vocal presence / instrumental probability heuristic by quality flags of file analysis + playcount
  let vocalPresence: number | null = null;
  let instrumentalProbability: number | null = null;
  if (playCount != null || rating != null) {
    let vocal = 0.35; // default unknown
    let weight = 1;
    if (playCount != null && playCount > 0) {
      vocal += Math.min(0.2, playCount * 0.002);
      weight += 1;
    }
    if (rating != null && rating >= 4) {
      vocal += 0.15;
      weight += 1;
    }
    vocalPresence = clamp01(vocal / weight);
    instrumentalProbability = clamp01(1 - (vocalPresence ?? 0));
  }

  // Mood tags
  if (bpm != null) {
    if (bpm < 110) moodTags.push('downtempo');
    else if (bpm < 122) moodTags.push('deep');
    else if (bpm < 133) moodTags.push('peak');
    else if (bpm < 142) moodTags.push('techno');
    else moodTags.push('hardgroove');
  }
  const minor = isMinorCamelot(input.musicalKey);
  if (minor === true) moodTags.push('melancholic');
  else if (minor === false) moodTags.push('uplifting');

  if (genre.length > 0) {
    if (genre.includes('tech') || genre.includes('techno')) moodTags.push('driving');
    if (genre.includes('melodic') || genre.includes('trance')) moodTags.push('melodic');
    if (genre.includes('deep')) moodTags.push('soulful');
    if (genre.includes('hard')) moodTags.push('energetic');
    if (genre.includes('disco') || genre.includes('funk')) moodTags.push('funky');
    if (genre.includes('ambient') || genre.includes('chill')) moodTags.push('chill');
    // Add slugified normalized genre token when known
    const genreTokens = genre
      .split(/[\s,/\\\-]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3);
    for (const token of genreTokens) {
      if (!moodTags.includes(token)) {
        moodTags.push(token);
      }
    }
  }
  if (rating != null && rating >= 5) moodTags.push('favorite_vibe');
  if (rating != null && rating === 0) moodTags.push('rejected_vibe');
  if (energy != null && energy >= 0.8) moodTags.push('high_energy');
  if (energy != null && energy <= 0.3) moodTags.push('low_energy');

  // Quality flags
  if (channels == null || sampleRate == null || bitrate == null) {
    qualityFlags.push('incomplete_file_analysis');
  } else {
    if (channels >= 2) qualityFlags.push('stereo_ok');
    else qualityFlags.push('mono_mix_detected');
    if (sampleRate >= 44100) qualityFlags.push('sample_rate_cd_plus');
    if (bitrate >= 320) qualityFlags.push('bitrate_high_quality');
    else if (bitrate >= 192) qualityFlags.push('bitrate_medium');
    else qualityFlags.push('bitrate_low');
  }

  // dedup + stable sort
  const sorted = [...new Set(moodTags)].sort();
  const sortedQ = [...new Set(qualityFlags)].sort();

  return {
    energy,
    danceability,
    danceFloorIntensity,
    rhythmicDensity,
    moodTags: sorted,
    vocalPresence,
    instrumentalProbability,
    qualityFlags: sortedQ,
  };
}

export function analyzeStructureV1Deterministic(input: StructureHeuristicInputs): {
  musicalSections: MusicalSectionV1[] | null;
  phraseBoundariesMs: number[] | null;
} {
  const bpm = typeof input.bpm === 'number' && Number.isFinite(input.bpm) && input.bpm > 40 && input.bpm < 220 ? input.bpm : null;
  const dur = typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds) && input.durationSeconds > 0 ? input.durationSeconds : null;

  if (dur == null) {
    return { musicalSections: null, phraseBoundariesMs: null };
  }

  const totalMs = Math.round(dur * 1000);
  const energyHint = clamp01(input.energyHint01) ?? 0.5;

  // Timeline proportional splits (sums 1.0 = 100%) — pure heuristic without file decode
  const parts: Array<{ type: MusicalSectionType; weight: number }> = [
    { type: 'intro', weight: 0.12 },
    { type: 'verse', weight: 0.2 },
    { type: 'breakdown', weight: 0.1 },
    { type: 'drop', weight: energyHint > 0.66 ? 0.42 : 0.38 },
    { type: 'outro', weight: energyHint > 0.66 ? 0.16 : 0.2 },
  ];
  // Adjust remainder to sum 1 exactly
  const sum = parts.reduce((acc, p) => acc + p.weight, 0);
  for (let i = 0; i < parts.length; i += 1) parts[i]!.weight /= sum;

  const sections: MusicalSectionV1[] = [];
  let cursorMs = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    const length = Math.max(4000, Math.round(totalMs * part.weight));
    let end = Math.min(totalMs, cursorMs + length);
    if (i === parts.length - 1) end = totalMs;
    sections.push({
      type: part.type,
      startMs: cursorMs,
      endMs: end,
      bpmEvidence: bpm,
      energyFloor01: defaultSectionEnergy(part.type, energyHint),
    });
    cursorMs = end;
  }

  // Phrase boundaries every 16 beats if BPM known; at minimum split on section boundaries
  const phraseBoundariesMs: number[] = [];
  if (bpm != null && bpm > 0) {
    const beatMs = (60 / bpm) * 1000;
    const phraseMs = beatMs * 16;
    if (phraseMs > 0 && Number.isFinite(phraseMs)) {
      let t = phraseMs;
      while (t < totalMs) {
        phraseBoundariesMs.push(Math.round(t));
        t += phraseMs;
      }
    }
  }
  for (const s of sections) {
    if (!phraseBoundariesMs.includes(s.startMs)) phraseBoundariesMs.push(s.startMs);
  }
  phraseBoundariesMs.sort((a, b) => a - b);

  return { musicalSections: sections, phraseBoundariesMs };
}

function defaultSectionEnergy(type: MusicalSectionType, hint: number): number {
  switch (type) {
    case 'intro':
      return Math.max(0.05, hint - 0.5);
    case 'outro':
      return Math.max(0.05, hint - 0.45);
    case 'breakdown':
      return Math.max(0.08, hint - 0.55);
    case 'drop':
    case 'peak':
      return Math.min(1, hint + 0.15);
    case 'verse':
    case 'chorus':
    case 'bridge':
      return Math.max(0.2, hint);
    case 'unknown':
    default:
      return hint;
  }
}

export function runMusicalHeuristicsV1(args: {
  trackId: string;
  metadata: MoodHeuristicInputs;
  bpm?: number | null;
  durationSeconds?: number | null;
  energyHint01?: number | null;
}): MusicalAudioFeaturesResult {
  void args.trackId;
  const mood = analyzeMoodV1Deterministic(args.metadata);
  const energyForStructure = mood.energy ?? (typeof args.energyHint01 === 'number' ? args.energyHint01 : null);
  const structure = analyzeStructureV1Deterministic({
    bpm: args.bpm ?? args.metadata.bpm ?? null,
    durationSeconds: args.durationSeconds ?? args.metadata.durationSeconds ?? null,
    energyHint01: energyForStructure,
  });
  return {
    energy: mood.energy,
    danceability: mood.danceability,
    danceFloorIntensity: mood.danceFloorIntensity,
    rhythmicDensity: mood.rhythmicDensity,
    moodTags: mood.moodTags,
    vocalPresence: mood.vocalPresence,
    instrumentalProbability: mood.instrumentalProbability,
    musicalSections: structure.musicalSections,
    phraseBoundariesMs: structure.phraseBoundariesMs,
    qualityFlags: mood.qualityFlags,
  };
}
