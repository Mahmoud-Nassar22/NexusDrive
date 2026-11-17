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
}

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');
