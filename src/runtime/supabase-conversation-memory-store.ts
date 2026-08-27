import type {
  ConversationMemoryStore,
  ConversationSnapshot,
} from '../ai/memory/conversation-memory-types.js';

export interface SupabaseConversationMemoryClient {
  invoke(
    functionName: string,
    body: unknown,
  ): Promise<{
    readonly data: unknown;
    readonly error: Error | null;
  }>;
}

function requireId(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      'Conversation id is required.',
    );
  }

  return normalized;
}

function parseSnapshot(
  value: unknown,
): ConversationSnapshot | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== 'object' ||
    value === null
  ) {
    throw new Error(
      'Invalid conversation memory response.',
    );
  }

  const record =
    value as Record<string, unknown>;

  const snapshot =
    (record.snapshot ??
      record.data ??
      value) as Record<string, unknown>;

  if (
    snapshot.schemaVersion !== 1 ||
    typeof snapshot.conversationId !== 'string' ||
    !Array.isArray(snapshot.messages) ||
    !Array.isArray(snapshot.constraints)
  ) {
    throw new Error(
      'Invalid conversation memory snapshot.',
    );
  }

  return snapshot as unknown as ConversationSnapshot;
}

export function createSupabaseConversationMemoryStore(
  client: SupabaseConversationMemoryClient,
): ConversationMemoryStore {
  return {
    async load(conversationId) {
      const id = requireId(conversationId);

      const result =
        await client.invoke(
          'conversation-memory',
          {
            operation: 'load',
            conversationId: id,
          },
        );

      if (result.error) {
        throw result.error;
      }

      return parseSnapshot(result.data);
    },

    async save(snapshot) {
      const result =
        await client.invoke(
          'conversation-memory',
          {
            operation: 'save',
            snapshot,
          },
        );

      if (result.error) {
        throw result.error;
      }
    },

    async delete(conversationId) {
      const id = requireId(conversationId);

      const result =
        await client.invoke(
          'conversation-memory',
          {
            operation: 'delete',
            conversationId: id,
          },
        );

      if (result.error) {
        throw result.error;
      }
    },
  };
}
