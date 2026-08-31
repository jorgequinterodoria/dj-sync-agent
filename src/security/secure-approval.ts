import { createHash, randomBytes } from 'node:crypto';

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '"__undefined__"';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? JSON.stringify(value)
      : JSON.stringify(`__number:${String(value)}__`);
  }
  if (typeof value === 'bigint') return JSON.stringify(`__bigint:${value.toString()}__`);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(`__unsupported:${typeof value}__`);
}

export function stableStringify(value: unknown): string {
  return canonicalize(value);
}

export function secureActionHash(action: unknown): string {
  return createHash('sha256')
    .update(stableStringify(action), 'utf8')
    .digest('hex');
}

export function secureToken(): string {
  return randomBytes(32).toString('hex');
}

export function secureId(): string {
  return randomBytes(18).toString('hex');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
