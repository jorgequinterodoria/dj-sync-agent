import { createHash } from 'node:crypto';

import type {
  TrackIntelligenceProfile,
} from './intelligence-engine.js';

export const SEMANTIC_DOCUMENT_SCHEMA_VERSION = 1 as const;

export interface SemanticDocument {
  schemaVersion: 1;
  documentType: 'dj.track';
  content: string;
  contentHash: string;
  trackId: string;
  trackHash: string | null;
  metadata: Record<string, unknown>;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function buildTrackSemanticDocument(
  profile: TrackIntelligenceProfile,
  options?: {
    trackId?: string;
    trackHash?: string | null;
  },
): SemanticDocument {
  const metadata = canonicalValue({
    metadata: profile.metadata,
    technical: profile.technical,
    analysis: profile.analysis,
    dj: profile.dj,
    audio: profile.audio,
    signals: profile.signals,
  }) as Record<string, unknown>;

  const content = JSON.stringify({
    schemaVersion: SEMANTIC_DOCUMENT_SCHEMA_VERSION,
    documentType: 'dj.track',
    metadata,
  });

  const contentHash = createHash('sha256')
    .update(content, 'utf8')
    .digest('hex');

  return {
    schemaVersion: 1,
    documentType: 'dj.track',
    content,
    contentHash,
    trackId:
      normalizeText(options?.trackId) ??
      `profile:${profile.provenance.analysisRunId ?? 'unknown'}`,
    trackHash: normalizeText(options?.trackHash ?? profile.provenance.trackHash),
    metadata,
  };
}
