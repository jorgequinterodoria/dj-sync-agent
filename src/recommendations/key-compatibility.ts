export type KeyRelation =
  | 'same'
  | 'compatible'
  | 'different'
  | 'unknown';

export type KeyCompatibility = KeyRelation;

interface CamelotKey {
  wheel: number;
  mode: 'A' | 'B';
}

const CAMELOT: Record<string, CamelotKey> = {
  '1A': { wheel: 1, mode: 'A' },
  '1B': { wheel: 1, mode: 'B' },
  '2A': { wheel: 2, mode: 'A' },
  '2B': { wheel: 2, mode: 'B' },
  '3A': { wheel: 3, mode: 'A' },
  '3B': { wheel: 3, mode: 'B' },
  '4A': { wheel: 4, mode: 'A' },
  '4B': { wheel: 4, mode: 'B' },
  '5A': { wheel: 5, mode: 'A' },
  '5B': { wheel: 5, mode: 'B' },
  '6A': { wheel: 6, mode: 'A' },
  '6B': { wheel: 6, mode: 'B' },
  '7A': { wheel: 7, mode: 'A' },
  '7B': { wheel: 7, mode: 'B' },
  '8A': { wheel: 8, mode: 'A' },
  '8B': { wheel: 8, mode: 'B' },
  '9A': { wheel: 9, mode: 'A' },
  '9B': { wheel: 9, mode: 'B' },
  '10A': { wheel: 10, mode: 'A' },
  '10B': { wheel: 10, mode: 'B' },
  '11A': { wheel: 11, mode: 'A' },
  '11B': { wheel: 11, mode: 'B' },
  '12A': { wheel: 12, mode: 'A' },
  '12B': { wheel: 12, mode: 'B' },
};

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
  return normalized in CAMELOT ? normalized : null;
}

export function keyRelation(
  current: string | null | undefined,
  candidate: string | null | undefined,
): KeyRelation {
  const a = normalizeKey(current);
  const b = normalizeKey(candidate);

  if (a === null || b === null) return 'unknown';

  const ka = CAMELOT[a];
  const kb = CAMELOT[b];

  if (ka === undefined || kb === undefined) return 'unknown';

  if (ka.wheel === kb.wheel && ka.mode === kb.mode) return 'same';

  const distance = Math.min(
    Math.abs(ka.wheel - kb.wheel),
    12 - Math.abs(ka.wheel - kb.wheel),
  );

  if (distance === 1 && ka.mode === kb.mode) return 'compatible';
  if (distance === 0 && ka.mode !== kb.mode) return 'compatible';

  return 'different';
}

export const keyCompatibility = keyRelation;
