import type {
  ConversationConstraint,
  ConversationMessage,
  ConversationSnapshot,
} from '../ai/memory/conversation-memory-types.js';
import {
  ConversationMemory,
} from '../ai/memory/conversation-memory.js';

export interface DJSyncConversationServiceOptions {
  readonly memory: ConversationMemory;
}

export interface DJSyncConversationService {
  load(): Promise<ConversationSnapshot>;
  addMessage(
    message: ConversationMessage,
  ): Promise<ConversationSnapshot>;
  setSummary(
    summary: string | null,
  ): Promise<ConversationSnapshot>;
  upsertConstraint(
    constraint: ConversationConstraint,
  ): Promise<ConversationSnapshot>;
  clear(): Promise<void>;
}

export function createDJSyncConversationService(
  options: DJSyncConversationServiceOptions,
): DJSyncConversationService {
  return {
    load: () =>
      options.memory.load(),

    addMessage: (message) =>
      options.memory.addMessage(message),

    setSummary: (summary) =>
      options.memory.setSummary(summary),

    upsertConstraint: (constraint) =>
      options.memory.upsertConstraint(constraint),

    clear: () =>
      options.memory.clear(),
  };
}
