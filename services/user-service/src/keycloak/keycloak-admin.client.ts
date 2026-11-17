import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReadinessRegistry } from '@nexusdrive/common';
import type { Env } from '../config/env';

const TIMEOUT_MS = 5000;

/** http://kc/realms/nexusdrive -> http://kc/admin/realms/nexusdrive (keeps any path prefix like /auth). */
export function adminBaseUrl(issuerUrl: string): string {
  const url = new URL(issuerUrl);
  const match = /^(.*)\/realms\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) {
    throw new Error(`KEYCLOAK_ISSUER_URL must end with /realms/<realm>: ${issuerUrl}`);
  }
  return `${url.origin}${match[1]}/admin/realms/${match[2]}`;
}

/**
 * Minimal Keycloak Admin REST API client. It logs in with the client-credentials
 * grant (a confidential client's service account) and caches the access token.
 * The service account needs realm-management roles: view-users, query-users,
 * manage-users, view-realm.
 */
@Injectable()
export class KeycloakAdminClient implements OnModuleInit {
  private readonly logger = new Logger(KeycloakAdminClient.name);
  private readonly tokenUrl: string;
  private readonly adminBase: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private cached?: { token: string; expiresAt: number };

  constructor(
    config: ConfigService<Env, true>,
    private readonly readiness: ReadinessRegistry,
  ) {
    const issuer = config.get('KEYCLOAK_ISSUER_URL', { infer: true }).replace(/\/$/, '');
    this.tokenUrl = `${issuer}/protocol/openid-connect/token`;
    this.adminBase = adminBaseUrl(issuer);
    this.clientId = config.get('KEYCLOAK_ADMIN_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('KEYCLOAK_ADMIN_CLIENT_SECRET', { infer: true });
  }

  onModuleInit() {
    // Ready only when Keycloak is up and our client credentials work.
    this.readiness.register('keycloak-admin', () => this.accessToken());
  }

  /** Calls `<admin base><path>`. Maps 404 to NotFound and other failures to 502. */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${this.adminBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) {
      throw new NotFoundException('not found in Keycloak');
    }
    if (!res.ok) {
      this.logger.warn(`${method} ${path} -> ${res.status}`);
      throw new BadGatewayException(`Keycloak admin API returned ${res.status}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.token;
    }
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new BadGatewayException(`Keycloak service-account login failed (${res.status})`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    // Refresh 30 s before expiry.
    this.cached = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(0, data.expires_in - 30) * 1000,
    };
    return data.access_token;
  }
}
