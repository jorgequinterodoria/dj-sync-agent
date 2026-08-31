export interface ToolResultMemoryEntry {
  readonly callKey: string;
  readonly tool: string;
  readonly result: unknown;
}

export class ToolResultMemory {
  private readonly entries =
    new Map<string, ToolResultMemoryEntry>();

  public has(callKey: string): boolean {
    return this.entries.has(
      callKey.trim(),
    );
  }

  public get(
    callKey: string,
  ): ToolResultMemoryEntry | undefined {
    return this.entries.get(
      callKey.trim(),
    );
  }

  public remember(
    entry: ToolResultMemoryEntry,
  ): void {
    const callKey = entry.callKey.trim();

    if (!callKey) {
      throw new Error(
        'Tool result call key is required.',
      );
    }

    if (this.entries.has(callKey)) {
      return;
    }

    this.entries.set(callKey, {
      ...entry,
      callKey,
    });
  }

  public entriesInOrder(): readonly ToolResultMemoryEntry[] {
    return [...this.entries.values()];
  }

  public clear(): void {
    this.entries.clear();
  }
}
