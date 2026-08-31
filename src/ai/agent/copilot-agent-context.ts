import type { CopilotContext } from '../context/copilot-context-types.js';

export interface CopilotAgentContextRequest {
  readonly userMessage: string;
}

export interface CopilotContextProvider {
  build(
    request: CopilotAgentContextRequest,
  ): Promise<CopilotContext>;
}

const CONTEXT_HEADER =
  'DJ_COPILOT_CONTEXT_V1';

export function serializeCopilotContext(
  context: CopilotContext,
): string {
  return [
    CONTEXT_HEADER,
    JSON.stringify(context),
    `END_${CONTEXT_HEADER}`,
  ].join('\n');
}
