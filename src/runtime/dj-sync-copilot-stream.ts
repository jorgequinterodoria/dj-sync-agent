import type {
  CopilotAgentRunInput,
  CopilotAgentRunResult,
} from '../ai/agent/copilot-agent-types.js';
import type { CopilotAgent } from '../ai/agent/copilot-agent.js';

export type CopilotStreamEvent =
  | {
      readonly type: 'started';
      readonly conversationId: string;
    }
  | {
      readonly type: 'assistant';
      readonly content: string;
    }
  | {
      readonly type: 'tool';
      readonly toolName: string;
      readonly status: 'started' | 'completed' | 'failed';
    }
  | {
      readonly type: 'completed';
      readonly response: string;
      readonly toolCalls: number;
    }
  | {
      readonly type: 'error';
      readonly message: string;
    };

export interface DJSyncCopilotStreamOptions {
  readonly agent: CopilotAgent;
  readonly conversationId: string;
}

export interface DJSyncCopilotStream {
  run(
    input: CopilotAgentRunInput,
    emit: (event: CopilotStreamEvent) => void,
  ): Promise<CopilotAgentRunResult>;
}

export function createDJSyncCopilotStream(
  options: DJSyncCopilotStreamOptions,
): DJSyncCopilotStream {
  const conversationId =
    options.conversationId.trim();

  if (!conversationId) {
    throw new Error(
      'Copilot conversation id is required.',
    );
  }

  return {
    async run(input, emit) {
      emit({
        type: 'started',
        conversationId,
      });

      try {
        const result =
          await options.agent.run(input);

        for (
          const execution
            of result.toolExecutions
        ) {
          emit({
            type: 'tool',
            toolName:
              execution.name,
            status: 'completed',
          });
        }

        if (result.response) {
          emit({
            type: 'assistant',
            content: result.response,
          });
        }

        emit({
          type: 'completed',
          response: result.response,
          toolCalls:
            result.toolExecutions.length,
        });

        return result;
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        emit({
          type: 'error',
          message,
        });

        throw error;
      }
    },
  };
}
