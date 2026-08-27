import type {
  ConversationMemoryStore,
  ConversationSnapshot,
} from './conversation-memory-types.js';

export interface ConversationMemoryApi {
  load(
    conversationId: string,
  ): Promise<ConversationSnapshot | null>;

  save(
    snapshot: ConversationSnapshot,
  ): Promise<void>;

  delete(
    conversationId: string,
  ): Promise<void>;
}

export function createConversationMemoryStore(
  api: ConversationMemoryApi,
): ConversationMemoryStore {
  return {
    load: (conversationId) =>
      api.load(conversationId),
    save: (snapshot) =>
      api.save(snapshot),
    delete: (conversationId) =>
      api.delete(conversationId),
  };
}
