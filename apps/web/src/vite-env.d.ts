/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KEYCLOAK_URL?: string;
  readonly VITE_KEYCLOAK_REALM?: string;
  readonly VITE_KEYCLOAK_CLIENT_ID?: string;
  readonly VITE_DRAWIO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Set by /config.js at runtime (see public/config.js). */
interface Window {
  __NEXUSDRIVE_CONFIG__?: {
    keycloakUrl?: string;
    realm?: string;
    clientId?: string;
    drawioUrl?: string;
  };
}
