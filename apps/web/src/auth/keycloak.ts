import Keycloak from 'keycloak-js';
import { config } from '../config';

/** One Keycloak instance for the whole app (it may only be initialised once). */
export const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.realm,
  clientId: config.clientId,
});

let initPromise: Promise<boolean> | undefined;

/** Redirects to the Keycloak login page if the user isn't signed in. */
export function initAuth(): Promise<boolean> {
  initPromise ??= keycloak.init({
    onLoad: 'login-required',
    pkceMethod: 'S256',
    checkLoginIframe: false,
  });
  return initPromise;
}

/** Returns a valid access token, refreshing it if it expires within 30 seconds. */
export async function getToken(): Promise<string> {
  await keycloak.updateToken(30);
  if (!keycloak.token) {
    throw new Error('not authenticated');
  }
  return keycloak.token;
}
