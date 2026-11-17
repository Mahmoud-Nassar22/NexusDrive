/** The authenticated caller, built from a Keycloak access token. */
export interface AuthUser {
  /** Stable Keycloak user id. Use this (not username) as the owner key for data. */
  sub: string;
  username: string;
  email?: string;
  /** Realm roles, e.g. ["user"] or ["user", "admin"]. */
  roles: string[];
}

export interface AuthModuleOptions {
  /** e.g. http://localhost:8080/realms/nexusdrive */
  issuerUrl: string;
  /** Optional expected `aud` claim. Leave empty to skip the audience check. */
  audience?: string;
  /**
   * Optional origin for server-to-server calls to Keycloak, e.g.
   * http://keycloak.identity.svc:8080. In a cluster, pods often can't (or
   * shouldn't) reach Keycloak through its public hostname. Tokens are still
   * checked against `issuerUrl`.
   */
  internalUrl?: string;
}

/**
 * The issuer URL rewritten to the internal origin, for fetching keys or calling
 * Keycloak from inside the cluster. Keeps the path (/realms/x or /auth/realms/x).
 */
export function keycloakServerUrl(issuerUrl: string, internalUrl?: string): string {
  const issuer = issuerUrl.replace(/\/$/, '');
  if (!internalUrl) return issuer;
  return `${internalUrl.replace(/\/$/, '')}${new URL(issuer).pathname}`;
}

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');
