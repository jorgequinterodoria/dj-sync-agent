import type {
  CopilotAgentRunResult,
} from '../ai/agent/copilot-agent-types.js';
import type {
  CopilotAgent,
} from '../ai/agent/copilot-agent.js';

export interface DJSyncCopilotChatMessage {
  readonly role:
    | 'user'
    | 'assistant'
    | 'tool';

  readonly content: string;

  readonly toolName?: string;
}

export interface DJSyncCopilotChatResult {
  readonly conversationId: string;
  readonly response: string;
  readonly messages:
    readonly DJSyncCopilotChatMessage[];
  readonly toolCalls: number;
}

export interface DJSyncCopilotChatOptions {
  readonly agent: CopilotAgent;
  readonly conversationId: string;
}

export interface DJSyncCopilotChat {
  send(
    message: string,
    signal?: AbortSignal,
  ): Promise<DJSyncCopilotChatResult>;
}

export function createDJSyncCopilotChat(
  options: DJSyncCopilotChatOptions,
): DJSyncCopilotChat {
  const conversationId =
    options.conversationId.trim();

  if (!conversationId) {
    throw new Error(
      'Copilot conversation id is required.',
    );
  }

  return {
    async send(
      message,
      signal,
    ): Promise<DJSyncCopilotChatResult> {
      const result: CopilotAgentRunResult =
        await options.agent.run({
          userMessage: message,
          ...(signal !== undefined
            ? { signal }
            : {}),
        });

      const messages: DJSyncCopilotChatMessage[] =
        [];

      for (const item of result.messages) {
        if (
          item.role !== 'user' &&
          item.role !== 'assistant' &&
          item.role !== 'tool'
        ) {
          continue;
        }

        messages.push({
          role: item.role,
          content: item.content,
          ...(item.toolName !== undefined
            ? {
                toolName: item.toolName,
              }
            : {}),
        });
      }

      return {
        conversationId,
        response: result.response,
        messages,
        toolCalls:
          result.toolExecutions.length,
      };
    },
  };
}