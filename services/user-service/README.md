# user-service

Users and the company structure. Keycloak is still where users, passwords, MFA and roles live; this service manages them through the Keycloak Admin REST API. Departments and memberships are stored in Postgres (`DATABASE_URL`, tables created on first use).

| Method | Path                                         | Who      | Description                                                            |
| ------ | -------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| GET    | `/api/users/me`                              | any user | The caller, from their token, plus their `department`                  |
| GET    | `/api/users/me/visibility`                   | any user | Whose files the caller may see (used by file-service)                  |
| GET    | `/api/users/departments`                     | `admin`  | Departments with member count and head                                 |
| POST   | `/api/users/departments`                     | `admin`  | Body `{ name }`: create (409 if the name exists)                       |
| GET    | `/api/users/departments/:id`                 | `admin`  | One department with its members                                        |
| PATCH  | `/api/users/departments/:id`                 | `admin`  | Body `{ name }`: rename                                                |
| DELETE | `/api/users/departments/:id`                 | `admin`  | Delete; its members leave the department                               |
| PUT    | `/api/users/departments/:id/members/:userId` | `admin`  | Body `{ role: head\|lead\|worker, leadId? }`: add, move or change role |
| DELETE | `/api/users/departments/:id/members/:userId` | `admin`  | Remove from the department                                             |
| GET    | `/api/users?search=`                         | `admin`  | Up to 100 users, each with `isAdmin`                                   |
| GET    | `/api/users/:id`                             | `admin`  | One user                                                               |
| PUT    | `/api/users/:id/admin`                       | `admin`  | Body `{ admin: boolean }`: grant or revoke the `admin` role            |
| PUT    | `/api/users/:id/enabled`                     | `admin`  | Body `{ enabled: boolean }`: enable or disable the account             |
| GET    | `/health` `/ready` `/metrics`                | probes   | `/ready` checks Postgres and the Keycloak service-account login        |

Admins can't remove their own admin role or disable their own account.

## Departments

A user is in at most one department, as `head` (one per department), `lead` (team leader) or `worker`. A worker may report to one team leader of the same department. File visibility narrows from the top down: a head sees everyone's files in the department, a team leader sees their own and their workers', and a worker sees only their own. When a team leader is demoted, moved or removed, their workers no longer have a team leader.

## Keycloak setup

The service logs in as the confidential client `nexusdrive-user-service` (client-credentials grant). Its service account has these `realm-management` roles: `view-users`, `query-users`, `manage-users`, `view-realm`. All of it is in [`config/keycloak/nexusdrive-realm.json`](../../config/keycloak/nexusdrive-realm.json).

The realm file takes the secret from `NEXUSDRIVE_USER_SERVICE_SECRET` when Keycloak imports it, falling back to a local-dev value. Give the same value to this service as `KEYCLOAK_ADMIN_CLIENT_SECRET`, from a Secret.

**TODO:** pagination beyond 100 users, admin membership through groups, audit log of admin actions.

```bash
cp .env.example .env
npm run dev     # from this folder, or `npm run dev:users` at the repo root
npm test
```
