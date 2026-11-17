export const config = {
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'nexusdrive',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'nexusdrive-web',
  drawioUrl: import.meta.env.VITE_DRAWIO_URL ?? 'http://localhost:8081',
};
