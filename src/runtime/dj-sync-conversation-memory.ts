import {
  ConversationMemory,
  InMemoryConversationMemoryStore,
} from '../ai/memory/conversation-memory.js';
import type {
  ConversationConstraint,
  ConversationMessage,
  ConversationMemoryStore,
  ConversationSnapshot,
} from '../ai/memory/conversation-memory-types.js';

export interface DJSyncConversationMemoryOptions {
  readonly conversationId: string;
  readonly store?: ConversationMemoryStore;
  readonly maxMessages?: number;
  readonly maxConstraints?: number;
}

export interface DJSyncConversationMemory {
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
  recentMessages(
    limit?: number,
  ): Promise<readonly ConversationMessage[]>;
  constraints(): Promise<
    readonly ConversationConstraint[]
  >;
  clear(): Promise<void>;
}

export function createDJSyncConversationMemory(
  options: DJSyncConversationMemoryOptions,
): DJSyncConversationMemory {
  const memory = new ConversationMemory({
    conversationId: options.conversationId,
    store:
      options.store ??
      new InMemoryConversationMemoryStore(),
    ...(options.maxMessages !== undefined
      ? { maxMessages: options.maxMessages }
      : {}),
    ...(options.maxConstraints !== undefined
      ? {
          maxConstraints:
            options.maxConstraints,
        }
      : {}),
  });

  return {
    load: () => memory.load(),
    addMessage: (message) =>
      memory.addMessage(message),
    setSummary: (summary) =>
      memory.setSummary(summary),
    upsertConstraint: (constraint) =>
      memory.upsertConstraint(constraint),
    recentMessages: (limit) =>
      memory.getRecentMessages(limit),
    constraints: () =>
      memory.getConstraints(),
    clear: () => memory.clear(),
  };
}
