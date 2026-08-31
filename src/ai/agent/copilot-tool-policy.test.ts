import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COPILOT_AGENT_TOOL_ALLOWLIST,
  COPILOT_AGENT_TOOL_POLICIES,
  createDefaultCopilotAgentToolPolicy,
} from './copilot-tool-policy.js';

test('PHASE61: Copilot Agent has the definitive allow-list', () => {
  assert.deepEqual(
    COPILOT_AGENT_TOOL_ALLOWLIST,
    [
      'library.search',
      'library.get_track',
      'recommend.next',
      'recommend.set_slot',
      'set.build',
      'set.analyze',
      'audio.analyze',
      'history.last_session',
      'live_context.get',
      'settings.list',
    ],
  );

  const policy = createDefaultCopilotAgentToolPolicy();
  assert.deepEqual(
    policy.registered(),
    [...COPILOT_AGENT_TOOL_ALLOWLIST].sort(),
  );
  assert.deepEqual(
    policy.filter([
      'library.search',
      'filesystem.read',
      'sql.query',
      'library.search',
      'master.db.write',
    ]),
    ['library.search'],
  );
  assert.equal(COPILOT_AGENT_TOOL_POLICIES.length, 10);
});

test('PHASE61: every default Copilot tool is read-only', () => {
  const policy = createDefaultCopilotAgentToolPolicy();

  for (const name of COPILOT_AGENT_TOOL_ALLOWLIST) {
    assert.equal(policy.decide(name).allowed, true);
  }

  assert.equal(policy.decide('master.db.write').allowed, false);
  assert.equal(policy.decide('filesystem.read').allowed, false);
});
