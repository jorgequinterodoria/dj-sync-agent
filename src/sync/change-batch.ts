import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChangeCursor, PersistedChangeCursor } from './change-cursor.js';
import { validateCursor } from './change-cursor.js';

export async function readChangeCursor(
  filePath: string,
): Promise<ChangeCursor | null> {
  try {
    await access(filePath);
  } catch {
    return null;
  }

  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid change cursor JSON: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid change cursor file.');
  }

  const payload = parsed as Partial<PersistedChangeCursor>;

  if (payload.schemaVersion !== 1) {
    throw new Error(`Unsupported change cursor schema version: ${String(payload.schemaVersion)}`);
  }

  if (payload.cursor === null || payload.cursor === undefined) {
    return null;
  }

  validateCursor(payload.cursor);
  return payload.cursor;
}

export async function writeChangeCursor(
  filePath: string,
  cursor: ChangeCursor | null,
): Promise<void> {
  const payload: PersistedChangeCursor = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    cursor,
  };

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}
