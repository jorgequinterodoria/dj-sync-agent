import { createAutonomousCopilot } from '../ai/orchestration/autonomous-copilot.js';
import type { AutonomousCopilotOptions, AutonomousCopilotRequest, AutonomousCopilotResult } from '../ai/orchestration/autonomous-copilot.js';

export function createDJSyncAutonomousCopilot(options: AutonomousCopilotOptions) {
  return createAutonomousCopilot(options);
}

export async function runDJSyncAutonomousCopilot(options: AutonomousCopilotOptions, request: AutonomousCopilotRequest): Promise<AutonomousCopilotResult> {
  return createAutonomousCopilot(options).run(request);
}
