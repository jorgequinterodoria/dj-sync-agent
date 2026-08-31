import type {
  CopilotContext,
  CopilotContextRequest,
  CopilotContextSourceBundle,
} from '../ai/context/copilot-context-types.js';

import {
  CopilotContextAssembler,
} from '../ai/context/copilot-context-assembler.js';

import type {
  CopilotContextProvider,
} from '../ai/agent/copilot-agent-context.js';

export interface DJSyncCopilotAgentContextOptions {
  readonly sources: (
    request: CopilotContextRequest,
  ) =>
    | CopilotContextSourceBundle
    | Promise<CopilotContextSourceBundle>;
  readonly budget?: Partial<{
    readonly maxMessages: number;
    readonly maxCandidates: number;
    readonly maxHistory: number;
    readonly maxMemoryResults: number;
    readonly maxContextChars: number;
  }>;
}

export interface DJSyncCopilotAgentContext
  extends CopilotContextProvider {}

export function createDJSyncCopilotAgentContext(
  options: DJSyncCopilotAgentContextOptions,
): DJSyncCopilotAgentContext {
  const assembler =
    new CopilotContextAssembler({
      ...(options.budget !== undefined
        ? {
            budget: options.budget,
          }
        : {}),
    });

  return {
    async build(request) {
      const sources =
        await options.sources(
          request,
        );

      const context =
        assembler.assemble(
          request,
          sources,
        );

      return context as CopilotContext;
    },
  };
}
