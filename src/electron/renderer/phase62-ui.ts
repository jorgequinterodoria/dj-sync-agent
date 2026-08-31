export interface Phase62LibraryFilters {
  readonly search: string;
  readonly genres: readonly string[];
  readonly keys: readonly string[];
  readonly bpmMin: number | null;
  readonly bpmMax: number | null;
}

export interface Phase62RecommendationItem {
  readonly trackId: string;
  readonly title: string;
  readonly artist: string;
  readonly bpm: number | null;
  readonly key: string | null;
  readonly score: number;
  readonly confidence: number;
  readonly reason: string;
}

export interface Phase62SetAnalysis {
  readonly trackCount: number;
  readonly energyAverage: number | null;
  readonly energyCurve: readonly number[];
  readonly bpmMin: number | null;
  readonly bpmMax: number | null;
  readonly bpmAverage: number | null;
  readonly artistCount: number;
  readonly repeatedArtistCount: number;
  readonly keyHistogram: ReadonlyArray<readonly [string, number]>;
  readonly warnings: readonly string[];
}


export interface Phase62TrackCandidate {
  readonly trackId: string;
  readonly title: string | null;
  readonly artist: string | null;
  readonly genre: string | null;
  readonly key: string | null;
  readonly bpm: number | null;
  readonly energy: number | null;
  readonly rating: number | null;
  readonly playCount: number | null;
}

export interface Phase62RecommendationContext {
  readonly deviceId: string;
  readonly currentTrack: Phase62TrackCandidate;
  readonly candidates: readonly Phase62TrackCandidate[];
  readonly request: string;
  readonly limit: number;
}

export function buildPhase62RecommendationContext(input: {
  readonly deviceId: string;
  readonly currentTrack: Phase62TrackCandidate;
  readonly candidates: readonly Phase62TrackCandidate[];
  readonly request?: string | null;
  readonly limit?: number;
}): Phase62RecommendationContext {
  const currentId = input.currentTrack.trackId.trim();
  const candidates = input.candidates
    .filter((candidate) => candidate.trackId.trim() && candidate.trackId.trim() !== currentId)
    .map((candidate) => ({ ...candidate, trackId: candidate.trackId.trim() }));
  return {
    deviceId: input.deviceId.trim(),
    currentTrack: { ...input.currentTrack, trackId: currentId },
    candidates,
    request: input.request?.trim() || 'Recomendaciones para el track actual',
    limit: Math.max(1, Math.min(20, Math.trunc(input.limit ?? 6))),
  };
}

export function normalizePhase62Filters(input: {
  readonly search?: string | null;
  readonly genre?: string | null;
  readonly bpm?: string | null;
  readonly key?: string | null;
}): Phase62LibraryFilters {
  const search = (input.search ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const genre = (input.genre ?? '').trim();
  const key = (input.key ?? '').trim();
  const bpm = (input.bpm ?? '').trim();
  let bpmMin: number | null = null;
  let bpmMax: number | null = null;
  if (/^\d+\s*-\s*\d+$/.test(bpm)) {
    const [a, b] = bpm.split('-').map((v) => Number(v.trim()));
    bpmMin = Number.isFinite(a) ? a : null;
    bpmMax = Number.isFinite(b) ? b : null;
  } else if (/^\d+\+$/.test(bpm)) {
    bpmMin = Number(bpm.slice(0, -1));
  }
  return {
    search,
    genres: genre ? [genre] : [],
    keys: key ? [key] : [],
    bpmMin,
    bpmMax,
  };
}

export function mapRecommendationForPhase62(input: {
  readonly trackId: string;
  readonly title?: string | null;
  readonly artist?: string | null;
  readonly bpm?: number | null;
  readonly key?: string | null;
  readonly score?: number;
  readonly confidence?: number;
  readonly reasons?: readonly { readonly detail: string }[];
}): Phase62RecommendationItem {
  const score = Number.isFinite(input.score) ? Math.max(0, Math.min(1, input.score ?? 0)) : 0;
  const confidence = Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence ?? 0))
    : 0;
  return {
    trackId: input.trackId,
    title: input.title?.trim() || 'Untitled',
    artist: input.artist?.trim() || 'Unknown artist',
    bpm: typeof input.bpm === 'number' && Number.isFinite(input.bpm) ? input.bpm : null,
    key: input.key?.trim() || null,
    score,
    confidence,
    reason: input.reasons?.find((r) => r.detail.trim())?.detail.trim() || 'Compatible con tu contexto actual.',
  };
}

export function buildPhase62SetAnalysis(input: {
  readonly energies: readonly (number | null | undefined)[];
  readonly bpms: readonly (number | null | undefined)[];
  readonly keys: readonly (string | null | undefined)[];
  readonly artists: readonly (string | null | undefined)[];
  readonly warnings?: readonly string[];
}): Phase62SetAnalysis {
  const energies = input.energies.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const bpms = input.bpms.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const keyMap = new Map<string, number>();
  for (const key of input.keys) {
    const normalized = key?.trim();
    if (normalized) keyMap.set(normalized, (keyMap.get(normalized) ?? 0) + 1);
  }
  const artistMap = new Map<string, number>();
  for (const artist of input.artists) {
    const normalized = artist?.trim().toLocaleLowerCase();
    if (normalized) artistMap.set(normalized, (artistMap.get(normalized) ?? 0) + 1);
  }
  const curve = energies.map((v) => Math.max(0, Math.min(10, v)));
  const repeatedArtistCount = [...artistMap.values()].filter((count) => count > 1).length;
  return {
    trackCount: Math.max(input.energies.length, input.bpms.length, input.keys.length, input.artists.length),
    energyAverage: energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : null,
    energyCurve: curve,
    bpmMin: bpms.length ? Math.min(...bpms) : null,
    bpmMax: bpms.length ? Math.max(...bpms) : null,
    bpmAverage: bpms.length ? bpms.reduce((a, b) => a + b, 0) / bpms.length : null,
    artistCount: artistMap.size,
    repeatedArtistCount,
    keyHistogram: [...keyMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    warnings: [...(input.warnings ?? [])],
  };
}
