import type {
  CopilotStreamEvent,
} from '../../runtime/dj-sync-copilot-stream.js';

export interface CopilotChatStreamStart {
  readonly conversationId: string;
  readonly message: string;
}

export type CopilotChatStreamEvent =
  CopilotStreamEvent & {
    readonly conversationId: string;
  };

export function withConversationId(
  conversationId: string,
  event: CopilotStreamEvent,
): CopilotChatStreamEvent {
  return {
    ...event,
    conversationId,
  };
}
