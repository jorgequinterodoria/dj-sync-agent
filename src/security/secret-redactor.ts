const SECRET_KEY_PATTERN = /(api[-_ ]?key|authorization|access[-_ ]?token|refresh[-_ ]?token|approval[-_ ]?token|password|passwd|secret|service[-_ ]?role|private[-_ ]?key|client[-_ ]?secret|credential)/i;
const REDACTED = '[REDACTED]';

function secretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactSecrets(
  value: unknown,
  keyHint?: string,
): unknown {
  if (
    keyHint !== undefined &&
    secretKey(keyHint)
  ) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      redactSecrets(item),
    );
  }

  if (
    typeof value === 'object' &&
    value !== null
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      ).map(([key, item]) => [
        key,
        redactSecrets(item, key),
      ]),
    );
  }

  return value;
}

export function containsSecretKey(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSecretKey);
  }

  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return false;
  }

  return Object.entries(
    value as Record<string, unknown>,
  ).some(([key, item]) =>
    secretKey(key) ||
    containsSecretKey(item),
  );
}

export function assertNoSecretKeys(
  value: unknown,
): void {
  if (containsSecretKey(value)) {
    throw new Error(
      'Sensitive fields are not permitted in this boundary.',
    );
  }
}
