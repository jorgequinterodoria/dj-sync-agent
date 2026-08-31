import type {
  ContextBudget,
  CopilotContext,
  CopilotContextRequest,
  CopilotContextSourceBundle,
} from '../ai/context/copilot-context-types.js';
import {
  CopilotContextAssembler,
} from '../ai/context/copilot-context-assembler.js';

export interface DJSyncCopilotContextOptions {
  readonly budget?: Partial<ContextBudget>;
}

export interface DJSyncCopilotContext {
  assemble(
    request: CopilotContextRequest,
    sources: CopilotContextSourceBundle,
  ): CopilotContext;
}

export function createDJSyncCopilotContext(
  options: DJSyncCopilotContextOptions = {},
): DJSyncCopilotContext {
  const assembler =
    new CopilotContextAssembler({
      ...(options.budget !== undefined
        ? { budget: options.budget }
        : {}),
    });

  return {
    assemble: (request, sources) =>
      assembler.assemble(
        request,
        sources,
      ),
  };
}
