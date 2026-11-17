// Order: runtime /config.js (per deployment) → VITE_* (build time) → local defaults.
const runtime = window.__NEXUSDRIVE_CONFIG__ ?? {};
const env = import.meta.env;

export const config = {
  keycloakUrl: runtime.keycloakUrl || env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: runtime.realm || env.VITE_KEYCLOAK_REALM || 'nexusdrive',
  clientId: runtime.clientId || env.VITE_KEYCLOAK_CLIENT_ID || 'nexusdrive-web',
  drawioUrl: runtime.drawioUrl || env.VITE_DRAWIO_URL || 'http://localhost:8081',
};
