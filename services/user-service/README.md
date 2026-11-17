# user-service

User management for NexusDrive admins. Keycloak is still where users, passwords, MFA and roles live. This service is a thin layer over the Keycloak Admin REST API, so the web app can manage users without sending people to the Keycloak console.

| Method | Path                          | Who      | Description                                                     |
| ------ | ----------------------------- | -------- | --------------------------------------------------------------- |
| GET    | `/api/users/me`               | any user | The caller, from their token                                    |
| GET    | `/api/users?search=`          | `admin`  | Up to 100 users, each with `isAdmin`                            |
| GET    | `/api/users/:id`              | `admin`  | One user                                                        |
| PUT    | `/api/users/:id/admin`        | `admin`  | Body `{ admin: boolean }`: grant or revoke the `admin` role     |
| PUT    | `/api/users/:id/enabled`      | `admin`  | Body `{ enabled: boolean }`: enable or disable the account      |
| GET    | `/health` `/ready` `/metrics` | probes   | `/ready` checks that the service account can log in to Keycloak |

Admins can't remove their own admin role or disable their own account.

## Keycloak setup

The service logs in as the confidential client `nexusdrive-user-service` (client-credentials grant). Its service account has these `realm-management` roles: `view-users`, `query-users`, `manage-users`, `view-realm`. All of it is in [`config/keycloak/nexusdrive-realm.json`](../../config/keycloak/nexusdrive-realm.json).

The client secret in the realm file and `.env.example` is for **local development only**. In a shared environment, regenerate it in Keycloak (Clients → nexusdrive-user-service → Credentials) and provide it through a Secret.

**TODO:** pagination beyond 100 users, admin membership through groups, audit log of admin actions.

```bash
cp .env.example .env
npm run dev     # from this folder, or `npm run dev:users` at the repo root
npm test
```
