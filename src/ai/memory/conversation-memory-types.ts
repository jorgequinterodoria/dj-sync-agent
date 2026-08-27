export type ConversationRole =
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool';

export interface ConversationMessage {
  readonly id: string;
  readonly role: ConversationRole;
  readonly content: string;
  readonly createdAt: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
}

export interface ConversationConstraint {
  readonly key: string;
  readonly value: string;
  readonly source: 'user' | 'system' | 'derived';
  readonly createdAt: string;
}

export interface ConversationSnapshot {
  readonly schemaVersion: 1;
  readonly conversationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly summary: string | null;
  readonly messages: readonly ConversationMessage[];
  readonly constraints: readonly ConversationConstraint[];
}

export interface ConversationMemoryStore {
  load(conversationId: string): Promise<ConversationSnapshot | null>;
  save(snapshot: ConversationSnapshot): Promise<void>;
  delete(conversationId: string): Promise<void>;
}

export interface ConversationMemoryOptions {
  readonly conversationId: string;
  readonly store: ConversationMemoryStore;
  readonly maxMessages?: number;
  readonly maxConstraints?: number;
  readonly now?: () => string;
}
