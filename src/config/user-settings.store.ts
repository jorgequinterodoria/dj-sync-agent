import { homedir } from 'node:os';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import {
  dirname,
  join,
} from 'node:path';
import { z } from 'zod';

export const USER_SETTINGS_DIR =
  join(
    homedir(),
    '.config',
    'dj-sync-agent',
  );

export const USER_SETTINGS_FILE =
  join(
    USER_SETTINGS_DIR,
    'settings.json',
  );

const COPILOT_PROVIDERS = [
  'openai',
  'anthropic',
  'openai-compatible',
] as const;

export const UserSettingsSchema =
  z.object({
    syncAgentId:
      z
        .string()
        .trim()
        .optional(),

    syncApiUrl:
      z
        .string()
        .trim()
        .url()
        .optional()
        .or(z.literal('')),

    syncApiKey:
      z
        .string()
        .trim()
        .optional(),

    rekordboxDbPath:
      z
        .string()
        .trim()
        .optional()
        .or(z.literal('')),

    rekordboxDbKey:
      z
        .string()
        .trim()
        .optional(),

    rekordboxCipherCompatibility:
      z
        .union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
        ])
        .optional(),

    copilotProvider:
      z
        .enum(
          COPILOT_PROVIDERS,
        )
        .optional(),

    copilotApiKey:
      z
        .string()
        .trim()
        .optional(),

    copilotBaseUrl:
      z
        .string()
        .trim()
        .url()
        .optional()
        .or(z.literal('')),

    copilotModel:
      z
        .string()
        .trim()
        .optional(),

    copilotMaxTokens:
      z
        .number()
        .int()
        .min(256)
        .max(32768)
        .optional(),

    npIntervalMs:
      z
        .number()
        .int()
        .min(150)
        .max(10000)
        .optional(),

    intelligenceJobsApiUrl:
      z
        .string()
        .trim()
        .url()
        .optional()
        .or(z.literal('')),

    logLevel:
      z
        .enum([
          'fatal',
          'error',
          'warn',
          'info',
          'debug',
          'trace',
        ])
        .optional(),
  });

export type UserSettings =
  z.infer<
    typeof UserSettingsSchema
  >;

export function ensureUserSettingsDir():
  void {
  if (!existsSync(USER_SETTINGS_DIR)) {
    mkdirSync(
      USER_SETTINGS_DIR,
      {
        recursive: true,
        mode: 0o700,
      },
    );
  }
}

export function readUserSettings():
  UserSettings {
  if (!existsSync(USER_SETTINGS_FILE)) {
    return {};
  }

  let parsed:
    | unknown
    | null =
    null;

  try {
    parsed =
      JSON.parse(
        readFileSync(
          USER_SETTINGS_FILE,
          'utf8',
        ),
      );
  } catch {
    return {};
  }

  const validated =
    UserSettingsSchema
      .partial()
      .safeParse(parsed);

  if (!validated.success) {
    return {};
  }

  return validated.data;
}

export function writeUserSettings(
  input:
    UserSettings,
): UserSettings {
  const validated =
    UserSettingsSchema
      .parse(input);

  ensureUserSettingsDir();

  const dir =
    dirname(
      USER_SETTINGS_FILE,
    );

  if (!existsSync(dir)) {
    mkdirSync(
      dir,
      {
        recursive: true,
        mode: 0o700,
      },
    );
  }

  writeFileSync(
    USER_SETTINGS_FILE,
    JSON.stringify(
      validated,
      null,
      2,
    ),
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );

  return validated;
}

/**
 * Merge de settings a process.env.
 * Prioridad: shell env > settings GUI (settings solo fill blanks).
 * Los keys de settings mappean a los nombres de env que espera el runtime.
 */
export function applyUserSettingsToEnv(
  settings:
    UserSettings,
  target:
    NodeJS.ProcessEnv =
    process.env,
): NodeJS.ProcessEnv {
  function setIfBlank(
    envKey: string,
    value:
      | string
      | number
      | undefined
      | null,
  ): void {
    const current =
      target[envKey]?.trim() ??
      '';

    if (current.length > 0) {
      return;
    }

    const next =
      typeof value === 'number'
        ? String(value)
        : (value ?? '').trim();

    if (next.length === 0) {
      return;
    }

    target[envKey] =
      next;
  }

  setIfBlank(
    'SYNC_AGENT_ID',
    settings.syncAgentId,
  );

  setIfBlank(
    'SYNC_API_URL',
    settings.syncApiUrl,
  );

  setIfBlank(
    'SYNC_API_KEY',
    settings.syncApiKey,
  );

  setIfBlank(
    'REKORDBOX_DB_PATH',
    settings.rekordboxDbPath,
  );

  setIfBlank(
    'REKORDBOX_DB_KEY',
    settings.rekordboxDbKey,
  );

  setIfBlank(
    'REKORDBOX_CIPHER_COMPATIBILITY',
    settings.rekordboxCipherCompatibility,
  );

  setIfBlank(
    'COPILOT_PROVIDER',
    settings.copilotProvider,
  );

  setIfBlank(
    'COPILOT_API_KEY',
    settings.copilotApiKey,
  );

  setIfBlank(
    'COPILOT_BASE_URL',
    settings.copilotBaseUrl,
  );

  setIfBlank(
    'COPILOT_MODEL',
    settings.copilotModel,
  );

  setIfBlank(
    'INTELLIGENCE_JOBS_API_URL',
    settings.intelligenceJobsApiUrl,
  );

  setIfBlank(
    'LOG_LEVEL',
    settings.logLevel,
  );

  return target;
}
