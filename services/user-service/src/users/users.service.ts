import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '@nexusdrive/common';
import { DepartmentsService, type Membership } from '../departments/departments.service';
import { KeycloakAdminClient } from '../keycloak/keycloak-admin.client';

export const ADMIN_ROLE = 'admin';
const MAX_RESULTS = 100;

/** The parts of Keycloak's UserRepresentation we use. */
interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdTimestamp?: number;
}

interface KeycloakRole {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdAt?: string;
  isAdmin: boolean;
  department?: Membership;
}

function toSummary(u: KeycloakUser, isAdmin: boolean, department?: Membership): UserSummary {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    enabled: u.enabled,
    createdAt:
      u.createdTimestamp === undefined ? undefined : new Date(u.createdTimestamp).toISOString(),
    isAdmin,
    department,
  };
}

/**
 * Admin operations on NexusDrive users. Keycloak stays the source of truth;
 * this service only reads and changes users through its Admin REST API.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly keycloak: KeycloakAdminClient,
    private readonly departments: DepartmentsService,
  ) {}

  async list(search?: string): Promise<UserSummary[]> {
    const params = new URLSearchParams({
      first: '0',
      max: String(MAX_RESULTS),
      briefRepresentation: 'true',
    });
    if (search) params.set('search', search);

    const [users, admins] = await Promise.all([
      this.keycloak.request<KeycloakUser[]>('GET', `/users?${params}`),
      // Direct members of the admin role (not through groups); enough for the MVP.
      this.keycloak.request<KeycloakUser[]>(
        'GET',
        `/roles/${ADMIN_ROLE}/users?first=0&max=1000&briefRepresentation=true`,
      ),
    ]);
    const adminIds = new Set(admins.map((a) => a.id));
    const memberships = await this.departments.memberships(users.map((u) => u.id));
    return users.map((u) => toSummary(u, adminIds.has(u.id), memberships.get(u.id)));
  }

  async get(id: string): Promise<UserSummary> {
    const [user, roles, membership] = await Promise.all([
      this.keycloak.request<KeycloakUser>('GET', `/users/${id}`),
      this.keycloak.request<KeycloakRole[]>('GET', `/users/${id}/role-mappings/realm`),
      this.departments.membership(id),
    ]);
    return toSummary(
      user,
      roles.some((r) => r.name === ADMIN_ROLE),
      membership,
    );
  }

  async setAdmin(actor: AuthUser, id: string, admin: boolean): Promise<UserSummary> {
    if (actor.sub === id && !admin) {
      throw new BadRequestException('you cannot remove your own admin role');
    }
    const role = await this.keycloak.request<KeycloakRole>('GET', `/roles/${ADMIN_ROLE}`);
    await this.keycloak.request(admin ? 'POST' : 'DELETE', `/users/${id}/role-mappings/realm`, [
      { id: role.id, name: role.name },
    ]);
    return this.get(id);
  }

  async setEnabled(actor: AuthUser, id: string, enabled: boolean): Promise<UserSummary> {
    if (actor.sub === id && !enabled) {
      throw new BadRequestException('you cannot disable your own account');
    }
    await this.keycloak.request('PUT', `/users/${id}`, { enabled });
    return this.get(id);
  }
}
