# Deployment notes

What the application needs from whoever packages and deploys it (Dockerfiles, Helm, Ingress, Terraform). The app code is deployment-agnostic; everything below is configuration.

## Runtime

- **Node.js 22** for all services (Node 18 is not supported: the LiveKit room API needs `globalThis.crypto`).
- It's an npm-workspaces monorepo. Each service imports `@nexusdrive/common` (`packages/common`), so a service image needs that package built too: `npm ci`, `npm run build:common`, `npm run build -w @nexusdrive/<service>`, then `node dist/main.js` from the service folder.
- Every service listens on `PORT`, logs JSON to stdout, and shuts down cleanly on SIGTERM.

## Routing (Ingress)

| Path              | Target                   | Notes                                                |
| ----------------- | ------------------------ | ---------------------------------------------------- |
| `/`               | web (static files)       | SPA: unknown paths must fall back to `index.html`    |
| `/api/files`      | file-service :3001       |                                                      |
| `/api/chat`       | chat-service :3002       | includes WebSocket upgrades on `/api/chat/socket.io` |
| `/api/users`      | user-service :3003       |                                                      |
| Keycloak, draw.io | own host or path         | the browser talks to both directly                   |
| LiveKit           | own host, `wss://` + UDP | needs a UDP-capable load balancer (NLB)              |

Probes on each service pod (outside the `/api` prefix): liveness `GET /health`, readiness `GET /ready` (checks dependencies, 3 s timeout each), metrics `GET /metrics`.

Service-to-service traffic (for NetworkPolicies): **file-service → user-service** and **chat-service → user-service** (`USER_SERVICE_URL`); file-service, chat-service and user-service → Keycloak (keys, admin API); chat-service → LiveKit API, Postgres, Redis; user-service → Postgres.

## Web app configuration

The web image is environment-independent. At runtime it loads **`/config.js`**; replace that file per environment (e.g. a ConfigMap mounted over it) and serve it with `Cache-Control: no-cache`:

```js
window.__NEXUSDRIVE_CONFIG__ = {
  keycloakUrl: 'https://auth.example.com',
  realm: 'nexusdrive',
  clientId: 'nexusdrive-web',
  drawioUrl: 'https://drawio.example.com',
};
```

## Service configuration

All variables are listed with local defaults in each service's `.env.example`. **Secret** = put it in a Secret, not a ConfigMap.

| Variable                                             | Service                    | Notes                                                                                                        |
| ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `KEYCLOAK_ISSUER_URL`                                | all                        | Public realm URL, exactly as it appears in tokens (`iss`), e.g. `https://auth.example.com/realms/nexusdrive` |
| `KEYCLOAK_INTERNAL_URL`                              | all (optional)             | In-cluster Keycloak origin for keys and admin calls, e.g. `http://keycloak.identity.svc:8080`                |
| `USER_SERVICE_URL`                                   | file-service, chat-service | e.g. `http://user-service.app.svc:3003`                                                                      |
| `S3_BUCKET`, `AWS_REGION`                            | file-service               | On AWS leave `S3_ENDPOINT` and the `AWS_*_KEY` variables unset and use IRSA                                  |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`                 | file-service               | Only for S3-compatible storage; the endpoint must be reachable **by browsers** (presigned URLs)              |
| `DATABASE_URL` (**secret**)                          | user-service, chat-service | Tables are created on first use                                                                              |
| `REDIS_URL`                                          | chat-service               | Required for more than one chat-service replica                                                              |
| `LIVEKIT_URL`                                        | chat-service               | Public `wss://` URL, returned to browsers                                                                    |
| `LIVEKIT_API_URL`                                    | chat-service (optional)    | In-cluster LiveKit API, e.g. `http://livekit.app.svc:7880`                                                   |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (**secret**) | chat-service               | Must match the LiveKit server's keys; use a secret of 32+ characters                                         |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` (**secret**)          | user-service               | Same value as `NEXUSDRIVE_USER_SERVICE_SECRET` below                                                         |

## Keycloak

Import `config/keycloak/nexusdrive-realm.json` (`--import-realm`) with these environment variables on the Keycloak container:

| Variable                         | Example                     | Used for                                      |
| -------------------------------- | --------------------------- | --------------------------------------------- |
| `NEXUSDRIVE_WEB_URL`             | `https://drive.example.com` | Allowed redirect / logout URLs and web origin |
| `NEXUSDRIVE_USER_SERVICE_SECRET` | (random, from a Secret)     | user-service's client secret                  |

Both fall back to local-dev values when unset. The import only creates the realm if it doesn't exist yet; later changes go through the admin console or a re-import.

The **Keycloak admin console** (`/admin`) is for platform operators, not for company admins: the app's Admin page covers users, roles and departments. Don't expose `/admin` publicly; block it at the Ingress and reach it via VPN or `kubectl port-forward`.

## Storage

- **S3 bucket CORS** must allow `GET` and `PUT` from the web origin, with header `Content-Type`, because browsers upload and download directly with presigned URLs.
- One Postgres database can serve both user-service and chat-service (different tables), or give each its own.
