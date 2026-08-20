import { createHash } from 'node:crypto';

export interface IdempotencyContext {
  agentId: string;
  stream: string;
  cursorBefore: {
    rbLocalUsn: number;
    id: string;
  } | null;
  cursorAfter: {
    rbLocalUsn: number;
    id: string;
  } | null;
  payloadHash: string;
}

export function buildIdempotencyKey(
  context: IdempotencyContext,
): string {
  const canonical = JSON.stringify({
    agentId: context.agentId,
    stream: context.stream,
    cursorBefore: context.cursorBefore,
    cursorAfter: context.cursorAfter,
    payloadHash: context.payloadHash,
  });

  return createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
}

export function constantTimeEqual(
  a: string,
  b: string,
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < a.length; index += 1) {
    result |=
      a.charCodeAt(index) ^
      b.charCodeAt(index);
  }

  return result === 0;
}
