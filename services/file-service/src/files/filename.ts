/**
 * Makes a user-supplied filename safe to use as the last segment of an S3 key
 * (same idea as werkzeug's secure_filename in the old Flask service):
 * no path separators, no control characters, no leading dots, bounded length.
 * Returns null if nothing usable is left.
 */
export function sanitizeFilename(input: string): string | null {
  const base = input.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 255);
  return cleaned.length > 0 ? cleaned : null;
}

/** Every user's files live under their own Keycloak id, never their username. */
export function userPrefix(userSub: string): string {
  return `users/${userSub}/`;
}
