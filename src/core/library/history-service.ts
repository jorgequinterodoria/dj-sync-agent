import type { DJHistoryEntry, DJHistoryQuery, DJHistoryResult } from '../domain/dj-history.js';
import { normalizeHistoryQuery } from '../domain/dj-history.js';

export interface HistorySource {
  load(): Promise<DJHistoryEntry[]>;
}

export class InMemoryHistorySource implements HistorySource {
  public constructor(private readonly entries: DJHistoryEntry[] = []) {}

  public async load(): Promise<DJHistoryEntry[]> {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

export class HistoryService {
  public constructor(private readonly source: HistorySource) {}

  public async getHistory(query: DJHistoryQuery = {}): Promise<DJHistoryResult> {
    const normalized = normalizeHistoryQuery(query);
    const entries = await this.source.load();
    const trackId = normalized.trackId?.trim();

    const filtered = entries
      .filter((entry) => {
        if (trackId && entry.trackId !== trackId) return false;
        if (normalized.from && entry.playedAt < normalized.from) return false;
        if (normalized.to && entry.playedAt > normalized.to) return false;
        return true;
      })
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || a.id.localeCompare(b.id));

    return {
      items: filtered.slice(0, normalized.limit),
      total: filtered.length,
      limit: normalized.limit,
    };
  }
}
