import type { DJReasoningContext } from './reasoning-types.js';

export const DJ_REASONING_SYSTEM_PROMPT = [
  'You are the reasoning engine of a DJ Copilot.',
  'Use only the supplied context. Never invent unavailable track facts.',
  'Return one JSON object and nothing else.',
  'Your JSON must have: priority, summary, decisions, constraints, evidence, confidence.',
  'priority must be low, normal, or high.',
  'decisions must contain type, subject, rationale, confidence.',
  'decision type must be keep, prefer, avoid, suggest, or investigate.',
  'evidence must contain source, key, value, weight.',
  'confidence values must be between 0 and 1.',
].join(' ');

export function buildDJReasoningPrompt(
  context: DJReasoningContext,
): string {
  return [
    'DJ REASONING REQUEST',
    `Track ID: ${context.trackId}`,
    `User request: ${context.userRequest.trim()}`,
    '',
    'Track Intelligence Profile:',
    JSON.stringify(context.profile),
    '',
    'Constraints:',
    JSON.stringify(context.constraints ?? []),
    '',
    'Semantic Memory Matches:',
    JSON.stringify(context.memory ?? []),
    '',
    'Recent Tracks:',
    JSON.stringify(context.recentTracks ?? []),
  ].join('\n');
}
