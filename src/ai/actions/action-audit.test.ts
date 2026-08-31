import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryActionAudit } from './action-audit.js';

test('audit redacts sensitive nested values', () => {
  const audit = new InMemoryActionAudit();
  audit.append({
    event: 'executed',
    actionId: 'action-1',
    deviceId: 'device-1',
    requestId: 'request-1',
    timestamp: '2026-08-27T00:00:00Z',
    result: { ok: true, apiKey: 'secret' },
  });

  assert.deepEqual(
    audit.list()[0]?.result,
    { ok: true, apiKey: '[REDACTED]' },
  );
});
