import type {
  AIEmbeddingProvider,
} from '../ai/embedding-provider.js';
import {
  createSemanticMemoryService,
} from './semantic-memory.js';
import type {
  SemanticMemoryService,
} from './semantic-memory.js';
import {
  SupabaseSemanticMemoryRepository,
} from './supabase-semantic-memory.js';
import type {
  TrackIntelligenceProfile,
} from '../intelligence/intelligence-engine.js';
import {
  buildTrackSemanticDocument,
} from '../intelligence/semantic-document.js';

export interface DJSyncSemanticMemorySnapshot {
  configured: boolean;
  provider: string | null;
  model: string | null;
  dimensions: number | null;
  status: 'disabled' | 'ready' | 'busy' | 'error';
  lastUpsertAt: string | null;
  lastSearchAt: string | null;
  lastError: string | null;
}

export interface DJSyncSemanticMemoryService {
  snapshot(): DJSyncSemanticMemorySnapshot;
  indexProfile(input: {
    deviceId: string;
    profile: TrackIntelligenceProfile;
    trackId: string;
    model: string;
  }): Promise<Awaited<ReturnType<SemanticMemoryService['embedTrack']>>>;
  search(input: {
    deviceId: string;
    query: string;
    model: string;
    limit?: number;
    minSimilarity?: number;
  }): ReturnType<SemanticMemoryService['search']>;
}

export function createDJSyncSemanticMemoryService(options: {
  provider: AIEmbeddingProvider | null;
  repositoryUrl: string | null;
  apiKey: string | null;
  deviceId: string;
}): DJSyncSemanticMemoryService {
  const configured =
    options.provider !== null &&
    Boolean(options.repositoryUrl?.trim()) &&
    Boolean(options.apiKey?.trim()) &&
    Boolean(options.deviceId.trim());

  let status: DJSyncSemanticMemorySnapshot['status'] =
    configured ? 'ready' : 'disabled';
  let lastUpsertAt: string | null = null;
  let lastSearchAt: string | null = null;
  let lastError: string | null = null;

  const service = configured
    ? createSemanticMemoryService({
        provider: options.provider,
        repository: new SupabaseSemanticMemoryRepository({
          url: options.repositoryUrl!,
          apiKey: options.apiKey!,
          agentId: options.deviceId,
        }),
      })
    : null;

  return {
    snapshot() {
      return {
        configured,
        provider: options.provider?.id ?? null,
        model: null,
        dimensions: options.provider?.dimensions ?? null,
        status,
        lastUpsertAt,
        lastSearchAt,
        lastError,
      };
    },

    async indexProfile({
      deviceId,
      profile,
      trackId,
      model,
    }) {
      if (!service) {
        throw new Error(
          'Semantic memory is not configured.',
        );
      }

      status = 'busy';
      lastError = null;

      try {
        const document = buildTrackSemanticDocument(
          profile,
          {
            trackId,
          },
        );
        const result = await service.embedTrack({
          deviceId,
          document,
          model,
        });
        lastUpsertAt = new Date().toISOString();
        status = 'ready';
        return result;
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : String(error);
        status = 'error';
        throw error;
      }
    },

    async search({
      deviceId,
      query,
      model,
      limit,
      minSimilarity,
    }) {
      if (!service) {
        throw new Error(
          'Semantic memory is not configured.',
        );
      }

      status = 'busy';
      lastError = null;

      try {
        const request: {
          deviceId: string;
          query: string;
          model: string;
          limit?: number;
          minSimilarity?: number;
        } = {
          deviceId,
          query,
          model,
        };

        if (limit !== undefined) {
          request.limit = limit;
        }

        if (minSimilarity !== undefined) {
          request.minSimilarity = minSimilarity;
        }

        const result = await service.search(request);
        lastSearchAt = new Date().toISOString();
        status = 'ready';
        return result;
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : String(error);
        status = 'error';
        throw error;
      }
    },
  };
}
