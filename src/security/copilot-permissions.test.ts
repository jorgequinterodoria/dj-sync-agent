import assert from 'node:assert/strict';
import test from 'node:test';
import { CopilotPermissionPolicy } from './copilot-permissions.js';

test('permission policy allows reads', () => {
  const policy = new CopilotPermissionPolicy();
  assert.equal(
    policy.decide({
      toolName: 'library.search',
      risk: 'read',
      mode: 'read-only',
    }),
    'allow',
  );
});

test('permission policy requires approval for mutations', () => {
  const policy = new CopilotPermissionPolicy();
  assert.equal(
    policy.decide({
      toolName: 'playlist.add',
      risk: 'write',
      mode: 'interactive',
    }),
    'approval_required',
  );
  policy.assertExecutable({
    toolName: 'playlist.add',
    risk: 'write',
    mode: 'interactive',
    approvalGranted: true,
  });
});

test('permission policy denies execute risk in read-only mode', () => {
  const policy = new CopilotPermissionPolicy();
  assert.equal(
    policy.decide({
      toolName: 'action.execute',
      risk: 'execute',
      mode: 'read-only',
    }),
    'deny',
  );
});
