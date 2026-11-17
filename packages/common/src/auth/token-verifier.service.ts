import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  AUTH_OPTIONS,
  keycloakServerUrl,
  type AuthModuleOptions,
  type AuthUser,
} from './auth.types';

interface KeycloakClaims extends JWTPayload {
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
}

/**
 * Verifies Keycloak access tokens against the realm's public keys (JWKS).
 * Used by the HTTP guard and by WebSocket gateways.
 */
@Injectable()
export class TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(@Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions) {
    const server = keycloakServerUrl(options.issuerUrl, options.internalUrl);
    // Keys are fetched lazily on first use and cached.
    this.jwks = createRemoteJWKSet(new URL(`${server}/protocol/openid-connect/certs`));
  }

  async verify(token: string): Promise<AuthUser> {
    const { payload } = await jwtVerify<KeycloakClaims>(token, this.jwks, {
      issuer: this.options.issuerUrl.replace(/\/$/, ''),
      audience: this.options.audience || undefined,
    });
    if (!payload.sub) {
      throw new Error('token has no subject');
    }
    return {
      sub: payload.sub,
      username: payload.preferred_username ?? payload.sub,
      email: payload.email,
      roles: payload.realm_access?.roles ?? [],
    };
  }
}
