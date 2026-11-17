import { BadGatewayException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ReadinessRegistry } from '@nexusdrive/common';
import type { Env } from '../config/env';
import { adminBaseUrl, KeycloakAdminClient } from './keycloak-admin.client';

describe('adminBaseUrl', () => {
  it('maps the issuer to the admin API, keeping any path prefix', () => {
    expect(adminBaseUrl('http://localhost:8080/realms/nexusdrive')).toBe(
      'http://localhost:8080/admin/realms/nexusdrive',
    );
    expect(adminBaseUrl('https://example.com/auth/realms/nexusdrive/')).toBe(
      'https://example.com/auth/admin/realms/nexusdrive',
    );
  });

  it('rejects an issuer without /realms/<realm>', () => {
    expect(() => adminBaseUrl('http://localhost:8080')).toThrow();
  });
});

describe('KeycloakAdminClient', () => {
  const values: Partial<Env> = {
    KEYCLOAK_ISSUER_URL: 'http://kc.test/realms/nexusdrive',
    KEYCLOAK_ADMIN_CLIENT_ID: 'svc',
    KEYCLOAK_ADMIN_CLIENT_SECRET: 's3cret',
  };
  const config = { get: (k: keyof Env) => values[k] } as unknown as ConfigService<Env, true>;
  const readiness = { register: jest.fn() } as unknown as ReadinessRegistry;

  const json = (status: number, body: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('logs in once with client credentials and reuses the token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: 'tok', expires_in: 300 }))
      .mockResolvedValueOnce(json(200, [{ id: '1' }]))
      .mockResolvedValueOnce(json(204, undefined));
    const client = new KeycloakAdminClient(config, readiness);

    expect(await client.request('GET', '/users')).toEqual([{ id: '1' }]);
    expect(await client.request('PUT', '/users/1', { enabled: false })).toBeUndefined();

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('http://kc.test/realms/nexusdrive/protocol/openid-connect/token');
    expect(String(tokenInit.body)).toContain('grant_type=client_credentials');
    expect(fetchMock.mock.calls[1][0]).toBe('http://kc.test/admin/realms/nexusdrive/users');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maps Keycloak errors', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: 'tok', expires_in: 300 }))
      .mockResolvedValueOnce(json(404, {}))
      .mockResolvedValueOnce(json(500, {}));
    const client = new KeycloakAdminClient(config, readiness);

    await expect(client.request('GET', '/users/x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(client.request('GET', '/users')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
