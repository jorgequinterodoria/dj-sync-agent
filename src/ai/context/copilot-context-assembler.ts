import {
  estimateJsonChars,
  normalizeContextBudget,
  truncateByBudget,
} from './context-budget.js';

import type {
  ContextBudget,
  CopilotContext,
  CopilotContextRequest,
  CopilotContextSourceBundle,
} from './copilot-context-types.js';

function normalizeOptionalRequestValue(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();

  return normalized || undefined;
}

export interface CopilotContextAssemblerOptions {
  readonly budget?: Partial<ContextBudget>;
}

export class CopilotContextAssembler {
  private readonly budget: ContextBudget;

  public constructor(
    options: CopilotContextAssemblerOptions = {},
  ) {
    this.budget = normalizeContextBudget(
      options.budget,
    );
  }

  public assemble(
    request: CopilotContextRequest,
    sources: CopilotContextSourceBundle,
  ): CopilotContext {
    const userMessage =
      request.userMessage.trim();

    if (!userMessage) {
      throw new Error(
        'Copilot context user message is required.',
      );
    }

    const truncated: string[] = [];

    const currentTrackId =
      normalizeOptionalRequestValue(
        request.currentTrackId,
      );

    const messages =
      truncateByBudget(
        sources.conversation.recentMessages,
        this.budget.maxMessages,
      );

    if (messages.truncated) {
      truncated.push(
        'conversation.messages',
      );
    }

    const candidates =
      truncateByBudget(
        sources.library?.candidates ?? [],
        this.budget.maxCandidates,
      );

    if (candidates.truncated) {
      truncated.push(
        'library.candidates',
      );
    }

    const history =
      truncateByBudget(
        sources.history?.recentPlays ?? [],
        this.budget.maxHistory,
      );

    if (history.truncated) {
      truncated.push(
        'history.recentPlays',
      );
    }

    const semantic =
      truncateByBudget(
        sources.semantic?.results ?? [],
        this.budget.maxMemoryResults,
      );

    if (semantic.truncated) {
      truncated.push(
        'semantic.results',
      );
    }

    const contextRequest: CopilotContextRequest =
      currentTrackId === undefined
        ? {
            userMessage,
          }
        : {
            userMessage,
            currentTrackId,
          };

    const context: CopilotContext = {
      schemaVersion: 1,

      request: contextRequest,

      conversation: {
        summary:
          sources.conversation.summary,
        recentMessages:
          messages.items,
        constraints:
          sources.conversation
            .constraints,
      },

      track:
        sources.track ??
        null,

      library: {
        ...(sources.library?.stats !==
        undefined
          ? {
              stats:
                sources.library.stats,
            }
          : {}),
        candidates:
          candidates.items,
      },

      history: {
        recentPlays:
          history.items,
        ...(sources.history
          ?.relatedPlays !== undefined
          ? {
              relatedPlays:
                sources.history.relatedPlays,
            }
          : {}),
      },

      intelligence:
        sources.intelligence ?? {},

      personalization:
        sources.personalization ?? {},

      semantic: {
        results:
          semantic.items,
      },

      truncated: [],

      estimatedChars: 0,
    };

    const estimatedChars =
      estimateJsonChars(context);

    if (
      estimatedChars >
      this.budget.maxContextChars
    ) {
      truncated.push(
        'context.total',
      );
    }

    return {
      ...context,
      truncated: Array.from(
        new Set(truncated),
      ),
      estimatedChars,
    };
  }
}

export function createCopilotContextAssembler(
  options: CopilotContextAssemblerOptions = {},
): CopilotContextAssembler {
  return new CopilotContextAssembler(
    options,
  );
}