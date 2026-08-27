export interface DJHistoryEntry {
  id: string;
  trackId: string;
  playedAt: string;
  source: 'rekordbox' | 'local';
  deviceId: string | null;
  position: number | null;
}

export interface DJHistoryQuery {
  trackId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface DJHistoryResult {
  items: DJHistoryEntry[];
  total: number;
  limit: number;
}

export function normalizeHistoryQuery(query: DJHistoryQuery = {}) {
  const limit = query.limit === undefined
    ? 100
    : Math.min(1000, Math.max(1, Math.trunc(query.limit)));

  return { ...query, limit };
}
