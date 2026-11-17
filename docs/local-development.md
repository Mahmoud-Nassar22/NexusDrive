# Local development

## Requirements

- **Node.js 22 LTS** (see `.nvmrc`). NestJS 11 does not run on Node 18.
- The backing services below, running locally. Packaging them (Docker Compose for dev, Helm for the cluster) is a DevOps-track task. Until that exists, run them however you like.

| Dependency               | Used by                                    | Local default                                                                                                       |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Keycloak                 | everything (login)                         | `http://localhost:8080`, import [`config/keycloak/nexusdrive-realm.json`](../config/keycloak/nexusdrive-realm.json) |
| MinIO (S3 stand-in)      | file-service                               | `http://localhost:9000`, bucket `nexusdrive-files`, CORS allowing `http://localhost:5173`                           |
| LiveKit server (`--dev`) | meetings                                   | `ws://localhost:7880`, key `devkey`, secret `secret`                                                                |
| draw.io                  | diagram editor                             | `http://localhost:8081`                                                                                             |
| PostgreSQL, Redis        | planned (chat history, multi-replica chat) | not needed yet                                                                                                      |

After importing the realm, create a user in the Keycloak admin console. Give them the `admin` role if they need the Admin page.

## Run

```bash
npm install              # once, at the repo root (installs all workspaces)
npm run build:common     # build the shared package (rerun after changing it, or: npm run dev -w @nexusdrive/common)

cp services/file-service/.env.example services/file-service/.env
cp services/chat-service/.env.example services/chat-service/.env
cp apps/web/.env.example apps/web/.env.local

npm run dev:files        # http://localhost:3001  (terminal 1)
npm run dev:chat         # http://localhost:3002  (terminal 2)
npm run dev:web          # http://localhost:5173  (terminal 3) – open this one
```

The Vite dev server proxies `/api/files` and `/api/chat` to the services, the same way the Ingress does in the cluster.

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
```
