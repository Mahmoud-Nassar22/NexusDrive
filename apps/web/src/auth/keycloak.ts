import Keycloak from 'keycloak-js';
import { config } from '../config';

/** One Keycloak instance for the whole app (it may only be initialised once). */
export const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.realm,
  clientId: config.clientId,
});

let initPromise: Promise<boolean> | undefined;

/**
 * Checks for an existing Keycloak session without forcing a login, so visitors
 * who aren't signed in see the landing page. Resolves to true when signed in.
 */
export function initAuth(): Promise<boolean> {
  initPromise ??= keycloak.init({
    onLoad: 'check-sso',
    silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
    pkceMethod: 'S256',
    checkLoginIframe: false,
  });
  return initPromise;
}

export const login = () => keycloak.login();
export const register = () => keycloak.register();

/**
 * Returns a valid access token, refreshing it if it expires within 30 seconds.
 * If the session is gone (e.g. expired overnight), sends the user to log in again.
 */
export async function getToken(): Promise<string> {
  try {
    await keycloak.updateToken(30);
  } catch {
    await keycloak.login();
  }
  if (!keycloak.token) {
    throw new Error('not authenticated');
  }
  return keycloak.token;
}
