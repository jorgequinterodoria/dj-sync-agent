import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  REKORDBOX_DB_PATH: z.string().optional(),
  REKORDBOX_DB_KEY: z.string().optional(),
  REKORDBOX_CIPHER_COMPATIBILITY: z.coerce.number().int().min(1).max(4).default(4),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  rekordboxDbPath: string;
};

function expandHome(filePath: string): string {
  if (filePath === '~') return homedir();
  if (filePath.startsWith('~/')) return resolve(homedir(), filePath.slice(2));
  return resolve(filePath);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    ...parsed,
    rekordboxDbPath: expandHome(
      parsed.REKORDBOX_DB_PATH?.trim() || '~/Library/Pioneer/rekordbox/master.db',
    ),
  };
}
