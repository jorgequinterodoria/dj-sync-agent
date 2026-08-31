import { ToolSelectionPolicy, type ToolPolicyDefinition } from './tool-selection-policy.js';

export const COPILOT_AGENT_TOOL_ALLOWLIST = [
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
] as const;

export const COPILOT_AGENT_TOOL_POLICIES: readonly ToolPolicyDefinition[] =
  COPILOT_AGENT_TOOL_ALLOWLIST.map((name) => ({
    name,
    risk: 'read' as const,
    enabled: true,
  }));

export function createDefaultCopilotAgentToolPolicy(): ToolSelectionPolicy {
  return new ToolSelectionPolicy(COPILOT_AGENT_TOOL_POLICIES);
}
