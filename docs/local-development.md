# Local development

## Requirements

- **Node.js 22 LTS** (see `.nvmrc`). Older versions are unsupported: on Node 18, for example, the LiveKit room API fails because `globalThis.crypto` is missing.
- The backing services below, running locally. Packaging them (Docker Compose for dev, Helm for the cluster) is a DevOps-track task. Until that exists, run them however you like.

| Dependency               | Used by                                                   | Local default                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keycloak                 | everything (login)                                        | `http://localhost:8080`, import [`config/keycloak/nexusdrive-realm.json`](../config/keycloak/nexusdrive-realm.json)                                                                        |
| S3 stand-in              | file-service                                              | `http://localhost:9000`, bucket `nexusdrive-files`, CORS allowing `http://localhost:5173`. MinIO no longer publishes images; SeaweedFS (`chrislusf/seaweedfs server -s3`, port 8333) works |
| LiveKit server (`--dev`) | meetings                                                  | `ws://localhost:7880`, key `devkey`, secret `secret`                                                                                                                                       |
| draw.io                  | diagram editor                                            | `http://localhost:8081`                                                                                                                                                                    |
| PostgreSQL               | user-service (departments), chat-service (rooms, history) | `postgres://nexusdrive:nexusdrive@localhost:5432/nexusdrive`                                                                                                                               |
| Redis (optional)         | chat-service (rooms shared across replicas)               | `redis://localhost:6379`. Without it, one chat-service replica only                                                                                                                        |

After importing the realm, create a user in the Keycloak admin console. Give them the `admin` role if they need the Admin page.

The realm also creates the `nexusdrive-user-service` client that user-service logs in with. If you imported the realm **before** this client existed, delete the `nexusdrive` realm and import it again (or create the client by hand as described in [services/user-service/README.md](../services/user-service/README.md)).

Tables are created on first use (user-service: `departments`, `department_members`; chat-service: `chat_rooms`, `chat_messages`). To turn on Redis, set `REDIS_URL` in `services/chat-service/.env`.

## Run

```bash
npm install              # once, at the repo root (installs all workspaces)
npm run build:common     # build the shared package (rerun after changing it, or: npm run dev -w @nexusdrive/common)

cp services/file-service/.env.example services/file-service/.env
cp services/chat-service/.env.example services/chat-service/.env
cp services/user-service/.env.example services/user-service/.env
cp apps/web/.env.example apps/web/.env.local

npm run dev:files        # http://localhost:3001  (terminal 1)
npm run dev:chat         # http://localhost:3002  (terminal 2)
npm run dev:users        # http://localhost:3003  (terminal 3)
npm run dev:web          # http://localhost:5173  (terminal 4) – open this one
```

The Vite dev server proxies `/api/files`, `/api/chat` and `/api/users` to the services, the same way the Ingress does in the cluster.

## How the pieces connect

| Page     | Calls                                                                                              | Which then talks to               |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| (all)    | Keycloak login, token on every request                                                             | every service checks it via JWKS  |
| Files    | `/api/files` → presigned URL → browser PUT/GET to S3                                               | S3                                |
| Diagrams | draw.io iframe; load/save through `/api/files` presigned URLs                                      | S3                                |
| Home     | `/api/users/me`, `/api/files`, `/api/chat/meetings`                                                | all of the below                  |
| Files    | (also) file-service → `GET /api/users/me/visibility` on user-service                               | Postgres (departments)            |
| Chat     | `/api/chat/rooms` (tiles), socket.io `/api/chat/socket.io`; chat-service → user-service for access | Postgres, Redis (optional)        |
| Meetings | `GET/POST /api/chat/meetings`, `POST …/<room>/token` → connect to LiveKit                          | LiveKit room API                  |
| Admin    | `/api/users` (users), `/api/users/departments` (departments)                                       | Keycloak Admin REST API, Postgres |

## Checks before opening a PR

```bash
npm run lint
npm test
npm run build
```

## Quick probes

```bash
curl localhost:3001/health      # 200
curl localhost:3001/ready       # 200 only if S3/MinIO is reachable
curl localhost:3001/metrics     # Prometheus text format
curl localhost:3001/api/files   # 401 without a token
curl localhost:3002/ready       # checks Postgres / Redis when configured
curl localhost:3003/ready       # 200 only if Postgres is up and the user-service client can log in to Keycloak
```
