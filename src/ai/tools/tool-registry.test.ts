import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { createToolRegistry } from './tool-registry.js';

test('registry lists registered tools in stable order', () => {
  const registry = createToolRegistry();
  const schema = z.object({ value: z.string() }).strict();

  registry.register({
    name: 'z.tool',
    description: 'z',
    risk: 'read',
    inputSchema: schema,
    timeoutMs: 1000,
    execute: async ({ value }) => value,
  });
  registry.register({
    name: 'a.tool',
    description: 'a',
    risk: 'read',
    inputSchema: schema,
    timeoutMs: 1000,
    execute: async ({ value }) => value,
  });

  assert.deepEqual(registry.list().map((tool) => tool.name), ['a.tool', 'z.tool']);
});

test('registry rejects malformed input before execution', async () => {
  const registry = createToolRegistry();
  let executed = false;

  registry.register({
    name: 'test.tool',
    description: 'test',
    risk: 'read',
    inputSchema: z.object({ id: z.string().min(1) }).strict(),
    timeoutMs: 1000,
    execute: async () => {
      executed = true;
      return 'ok';
    },
  });

  const result = await registry.execute(
    'test.tool',
    { id: '' },
    { deviceId: 'device', requestId: 'request', now: () => 'now' },
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.error.code, 'invalid_input');
  assert.equal(executed, false);
});

test('registry enforces the tool allowlist', async () => {
  const registry = createToolRegistry({ allowedTools: ['allowed.tool'] });
  const schema = z.object({}).strict();

  registry.register({
    name: 'blocked.tool',
    description: 'blocked',
    risk: 'read',
    inputSchema: schema,
    timeoutMs: 1000,
    execute: async () => 'never',
  });

  const result = await registry.execute(
    'blocked.tool',
    {},
    { deviceId: 'device', requestId: 'request', now: () => 'now' },
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.error.code, 'not_allowed');
});

test('registry converts execution timeout into structured failure', async () => {
  const registry = createToolRegistry();

  registry.register({
    name: 'slow.tool',
    description: 'slow',
    risk: 'read',
    inputSchema: z.object({}).strict(),
    timeoutMs: 10,
    execute: async () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
  });

  const result = await registry.execute(
    'slow.tool',
    {},
    { deviceId: 'device', requestId: 'request', now: () => 'now' },
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.error.code, 'timeout');
});
