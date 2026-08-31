import type {
  DJSyncCopilotChatResult,
} from '../../runtime/dj-sync-copilot-chat.js';

export interface CopilotChatSendInput {
  readonly conversationId: string;
  readonly message: string;
}

export interface CopilotChatError {
  readonly code: 'invalid_request' | 'execution_failed';
  readonly message: string;
}

export type CopilotChatSendResult =
  | {
      readonly ok: true;
      readonly result: DJSyncCopilotChatResult;
    }
  | {
      readonly ok: false;
      readonly error: CopilotChatError;
    };
