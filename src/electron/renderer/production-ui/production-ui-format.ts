export function formatBpm(
  bpm: number | null | undefined,
): string {
  if (
    bpm === null ||
    bpm === undefined ||
    !Number.isFinite(bpm)
  ) {
    return '—';
  }

  /*
   * Keep the BPM human-readable without introducing
   * unnecessary trailing zeroes.
   *
   * Examples:
   *   128    -> "128"
   *   127.5  -> "127.5"
   *   127.25 -> "127.25"
   */
  return Number(
    bpm.toFixed(2),
  ).toString();
}

export function formatKey(
  key: string | null | undefined,
): string {
  const value =
    key?.trim();

  return value || '—';
}

export function formatConnection(
  state:
    | 'connecting'
    | 'connected'
    | 'degraded'
    | 'disconnected',
): string {
  switch (state) {
    case 'connecting':
      return 'Connecting';

    case 'connected':
      return 'Connected';

    case 'degraded':
      return 'Degraded';

    case 'disconnected':
      return 'Disconnected';
  }
}

export function formatCopilotState(
  state:
    | 'idle'
    | 'thinking'
    | 'streaming'
    | 'awaiting_approval'
    | 'executing'
    | 'completed'
    | 'error',
): string {
  switch (state) {
    case 'idle':
      return 'Ready';

    case 'thinking':
      return 'Thinking';

    case 'streaming':
      return 'Streaming';

    case 'awaiting_approval':
      return 'Waiting for approval';

    case 'executing':
      return 'Executing';

    case 'completed':
      return 'Completed';

    case 'error':
      return 'Error';
  }
}

export function formatSyncState(
  state:
    | 'idle'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'error',
): string {
  switch (state) {
    case 'idle':
      return 'Idle';

    case 'starting':
      return 'Starting';

    case 'running':
      return 'Running';

    case 'stopping':
      return 'Stopping';

    case 'error':
      return 'Error';
  }
}