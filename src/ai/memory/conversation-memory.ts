import type {
  ConversationConstraint,
  ConversationMemoryOptions,
  ConversationMessage,
  ConversationMemoryStore,
  ConversationSnapshot,
} from './conversation-memory-types.js';

const DEFAULT_MAX_MESSAGES = 30;
const DEFAULT_MAX_CONSTRAINTS = 24;

function normalizePositiveLimit(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      'Conversation memory limit must be a positive integer.',
    );
  }

  return value;
}

function normalizeId(
  value: string,
  field: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

function cloneMessage(
  message: ConversationMessage,
): ConversationMessage {
  return {
    ...message,
  };
}

function cloneConstraint(
  constraint: ConversationConstraint,
): ConversationConstraint {
  return {
    ...constraint,
  };
}

function sortMessages(
  messages: readonly ConversationMessage[],
): ConversationMessage[] {
  return [...messages].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

function sortConstraints(
  constraints: readonly ConversationConstraint[],
): ConversationConstraint[] {
  return [...constraints].sort(
    (a, b) =>
      a.key.localeCompare(b.key) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export class ConversationMemory {
  private readonly conversationId: string;
  private readonly store: ConversationMemoryStore;
  private readonly maxMessages: number;
  private readonly maxConstraints: number;
  private readonly now: () => string;

  private snapshotState:
    ConversationSnapshot | null = null;

  public constructor(
    options: ConversationMemoryOptions,
  ) {
    this.conversationId = normalizeId(
      options.conversationId,
      'Conversation id',
    );

    this.store = options.store;

    this.maxMessages =
      normalizePositiveLimit(
        options.maxMessages,
        DEFAULT_MAX_MESSAGES,
      );

    this.maxConstraints =
      normalizePositiveLimit(
        options.maxConstraints,
        DEFAULT_MAX_CONSTRAINTS,
      );

    this.now =
      options.now ??
      (() => new Date().toISOString());
  }

  public async load(): Promise<ConversationSnapshot> {
    if (this.snapshotState) {
      return this.snapshotState;
    }

    const stored =
      await this.store.load(this.conversationId);

    if (!stored) {
      const timestamp = this.now();

      this.snapshotState = {
        schemaVersion: 1,
        conversationId: this.conversationId,
        createdAt: timestamp,
        updatedAt: timestamp,
        summary: null,
        messages: [],
        constraints: [],
      };

      return this.snapshotState;
    }

    if (
      stored.schemaVersion !== 1 ||
      stored.conversationId !==
        this.conversationId
    ) {
      throw new Error(
        'Unsupported conversation memory snapshot.',
      );
    }

    this.snapshotState = {
      schemaVersion: 1,
      conversationId: stored.conversationId,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      summary: stored.summary,
      messages: sortMessages(
        stored.messages.map(cloneMessage),
      ).slice(-this.maxMessages),
      constraints: sortConstraints(
        stored.constraints.map(
          cloneConstraint,
        ),
      ).slice(-this.maxConstraints),
    };

    return this.snapshotState;
  }

  public async addMessage(
    message: ConversationMessage,
  ): Promise<ConversationSnapshot> {
    const snapshot = await this.load();

    const id = normalizeId(
      message.id,
      'Message id',
    );

    const content = message.content.trim();

    if (!content) {
      throw new Error(
        'Conversation message content is required.',
      );
    }

    const normalized: ConversationMessage = {
      id,
      role: message.role,
      content,
      createdAt: message.createdAt,
      ...(message.toolCallId !== undefined
        ? {
            toolCallId:
              message.toolCallId,
          }
        : {}),
      ...(message.toolName !== undefined
        ? {
            toolName:
              message.toolName,
          }
        : {}),
    };

    const messages = sortMessages([
      ...snapshot.messages.filter(
        (item) => item.id !== id,
      ),
      normalized,
    ]).slice(-this.maxMessages);

    this.snapshotState = {
      ...snapshot,
      updatedAt: this.now(),
      messages,
    };

    await this.store.save(
      this.snapshotState,
    );

    return this.snapshotState;
  }

  public async setSummary(
    summary: string | null,
  ): Promise<ConversationSnapshot> {
    const snapshot = await this.load();

    const normalized =
      summary === null
        ? null
        : summary.trim() || null;

    this.snapshotState = {
      ...snapshot,
      updatedAt: this.now(),
      summary: normalized,
    };

    await this.store.save(
      this.snapshotState,
    );

    return this.snapshotState;
  }

  public async upsertConstraint(
    constraint: ConversationConstraint,
  ): Promise<ConversationSnapshot> {
    const snapshot = await this.load();

    const key = normalizeId(
      constraint.key,
      'Constraint key',
    );

    const value = constraint.value.trim();

    if (!value) {
      throw new Error(
        'Constraint value is required.',
      );
    }

    const normalized: ConversationConstraint = {
      key,
      value,
      source: constraint.source,
      createdAt: constraint.createdAt,
    };

    const constraints =
      sortConstraints([
        ...snapshot.constraints.filter(
          (item) => item.key !== key,
        ),
        normalized,
      ]).slice(-this.maxConstraints);

    this.snapshotState = {
      ...snapshot,
      updatedAt: this.now(),
      constraints,
    };

    await this.store.save(
      this.snapshotState,
    );

    return this.snapshotState;
  }

  public async clear(): Promise<void> {
    this.snapshotState = null;
    await this.store.delete(
      this.conversationId,
    );
  }

  public async getRecentMessages(
    limit = this.maxMessages,
  ): Promise<
    readonly ConversationMessage[]
  > {
    const snapshot = await this.load();

    const bounded =
      normalizePositiveLimit(
        limit,
        this.maxMessages,
      );

    return snapshot.messages.slice(-bounded);
  }

  public async getConstraints(): Promise<
    readonly ConversationConstraint[]
  > {
    return (await this.load()).constraints;
  }
}

export class InMemoryConversationMemoryStore
  implements ConversationMemoryStore
{
  private readonly snapshots =
    new Map<
      string,
      ConversationSnapshot
    >();

  public async load(
    conversationId: string,
  ): Promise<ConversationSnapshot | null> {
    const snapshot =
      this.snapshots.get(
        conversationId,
      );

    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      messages:
        snapshot.messages.map(
          cloneMessage,
        ),
      constraints:
        snapshot.constraints.map(
          cloneConstraint,
        ),
    };
  }

  public async save(
    snapshot: ConversationSnapshot,
  ): Promise<void> {
    this.snapshots.set(
      snapshot.conversationId,
      {
        ...snapshot,
        messages:
          snapshot.messages.map(
            cloneMessage,
          ),
        constraints:
          snapshot.constraints.map(
            cloneConstraint,
          ),
      },
    );
  }

  public async delete(
    conversationId: string,
  ): Promise<void> {
    this.snapshots.delete(
      conversationId,
    );
  }
}