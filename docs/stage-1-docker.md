# Stage 1: Docker

**Goal:** every part of NexusDrive runs as a container started with plain `docker run`, with no Node on the host. The images built here are the same images later used by Compose (Stage 2), Kubernetes (Stage 3) and EKS (Stage 4). Only configuration changes between stages, never the build.

**Out of scope here:** Compose, registries, CI. Those come in later stages.

## What gets an image

| Component                                              | Image                        | Dockerfile                         |
| ------------------------------------------------------ | ---------------------------- | ---------------------------------- |
| file-service                                           | ours                         | `services/file-service/Dockerfile` |
| chat-service                                           | ours                         | `services/chat-service/Dockerfile` |
| user-service                                           | ours                         | `services/user-service/Dockerfile` |
| web                                                    | ours (static files on nginx) | `apps/web/Dockerfile`              |
| Keycloak, Postgres, Redis, SeaweedFS, LiveKit, draw.io | upstream, unchanged          | none                               |

## Layout

```
finalproject/
├── .dockerignore                    # one file, at the root (see "Build context")
├── services/
│   ├── file-service/Dockerfile
│   ├── chat-service/Dockerfile
│   └── user-service/Dockerfile
├── apps/web/
│   ├── Dockerfile
│   └── docker/
│       ├── nginx.conf               # SPA fallback + /api proxying (see "Web image")
│       └── docker-entrypoint.sh     # writes /config.js from env vars at container start
└── deploy/
    └── docker-run/
        ├── up.sh                    # creates the network and starts every container
        └── down.sh                  # stops and removes them
```

Later stages add `compose.yaml` at the root (Stage 2), then `deploy/k8s/` or `deploy/helm/` (Stage 3) and `infra/terraform/` (Stage 4).

The three service Dockerfiles will be nearly identical. Start with three copies. Once one works, you can merge them into a single Dockerfile that takes `--build-arg SERVICE=file-service`.

## Build context: always the repo root

This is an npm-workspaces monorepo. There is one `package-lock.json` at the root, and every service depends on `packages/common` (`@nexusdrive/common`). A service folder alone can't be built, so **the Dockerfile lives next to the service, but the build runs from the root:**

```bash
TAG=$(git rev-parse --short HEAD)
docker build -f services/file-service/Dockerfile -t nexusdrive/file-service:$TAG .
docker build -f apps/web/Dockerfile              -t nexusdrive/web:$TAG .
```

Tag images with the git SHA, not `latest`, so you always know what code an image holds.

Because the context is the root, `.dockerignore` must keep it small: `node_modules`, `**/dist`, `.git`, `.env` / `.env.*` (keep `!**/.env.example` if you want), `coverage`, `arch`, `docs`. Without it, every build sends hundreds of MB to the Docker daemon and can leak local `.env` files into images.

## Node service images

What the image has to do (see also [deployment-notes.md](deployment-notes.md#runtime)):

1. **Install:** `npm ci` needs the root `package.json`, `package-lock.json`, and the `package.json` of each workspace it installs. Copy those first, install, then copy the source. This way, code changes don't throw away the dependency layer.
2. **Build:** `npm run build -w @nexusdrive/common`, then `npm run build -w @nexusdrive/<service>`.
3. **Runtime stage:** production dependencies only (`npm ci --omit=dev -w @nexusdrive/<service> -w @nexusdrive/common`), plus `packages/common/dist` and the service's `dist`. The service resolves `@nexusdrive/common` through the workspace symlink in `node_modules`, so keep the same folder structure as the repo.
4. **Run:** `node dist/main.js` from the service folder, on **Node 22**. Node 18 breaks the LiveKit API.

Requirements for every service image:

- [ ] Multi-stage build; the final image has no TypeScript, Nest CLI, Jest or source files
- [ ] Runs as a non-root user (the `node` user in the official image works)
- [ ] `EXPOSE` the service port: file 3001, chat 3002, users 3003 (set with `PORT`)
- [ ] `HEALTHCHECK` on `GET /health`
- [ ] `node` is PID 1 or runs under an init (`docker run --init` or `tini`), so `docker stop` sends it SIGTERM and it shuts down cleanly. The services already handle SIGTERM.
- [ ] OCI labels: `org.opencontainers.image.source`, `.revision` (git SHA), `.created`
- [ ] No secrets in the image. All config comes from env vars at `docker run`.

## Web image

Two stages: build with Node (`npm run build -w @nexusdrive/web`, output in `apps/web/dist`), then serve the static files with nginx (an unprivileged nginx image, so it doesn't run as root).

**Runtime config already exists. Don't use `VITE_*` in the image.** `index.html` loads `/config.js` before the app, and [`apps/web/src/config.ts`](../apps/web/src/config.ts) prefers `window.__NEXUSDRIVE_CONFIG__` over the build-time `VITE_*` values. The entrypoint script writes `config.js` from container env vars (`KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `DRAWIO_URL`) and then starts nginx. One image then serves every environment. Serve `/config.js` with `Cache-Control: no-cache`.

**nginx stands in for the Ingress.** In development, the Vite dev server forwards `/api/*` to the services ([`vite.config.ts`](../apps/web/vite.config.ts)). In a container, nginx has to do it. The routes are in [deployment-notes.md](deployment-notes.md#routing-ingress):

| Path            | Proxy to                   | Notes                                                                        |
| --------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `/api/files`    | `http://file-service:3001` |                                                                              |
| `/api/chat`     | `http://chat-service:3002` | WebSockets on `/api/chat/socket.io`: pass `Upgrade` and `Connection` headers |
| `/api/users`    | `http://user-service:3003` |                                                                              |
| everything else | static files               | unknown paths fall back to `index.html` (React routing)                      |

**Publish the web container on host port 5173.** Keycloak's redirect URIs and the S3 CORS rule both expect `http://localhost:5173` by default. If you use another port, set `NEXUSDRIVE_WEB_URL` on Keycloak (and re-import the realm) and update CORS.

## Networking: two names for the same thing

Create a user-defined network (`docker network create nexusdrive`) and start every container on it with a stable `--name`. Containers then reach each other by name (`http://user-service:3003`). Inside a container, `localhost` means that container itself, not your machine.

Some addresses are used by **both the browser and the services**. The browser can't resolve container names, and the containers can't use the browser's `localhost`. The services split these addresses:

| What         | Browser uses (public)                                                                        | Container uses (internal)                        |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Keycloak     | `KEYCLOAK_ISSUER_URL=http://localhost:8080/realms/nexusdrive` (must match the token's `iss`) | `KEYCLOAK_INTERNAL_URL=http://keycloak:8080`     |
| LiveKit      | `LIVEKIT_URL=ws://localhost:7880`                                                            | `LIVEKIT_API_URL=http://livekit:7880`            |
| user-service | (not used)                                                                                   | `USER_SERVICE_URL=http://user-service:3003`      |
| **S3**       | **presigned URLs from `S3_ENDPOINT`**                                                        | **also `S3_ENDPOINT` (list, delete, readiness)** |

> **Open issue: S3 has only one endpoint setting.** file-service uses `S3_ENDPOINT` both to sign browser URLs and for its own calls ([storage.service.ts](../services/file-service/src/storage/storage.service.ts)). `http://localhost:9000` works for the browser but not inside the container; `http://s3:8333` works inside the container but not in the browser. Options:
>
> 1. **(Recommended)** Add an optional `S3_PUBLIC_ENDPOINT` to file-service and use it only for presigning, like `KEYCLOAK_INTERNAL_URL` and `LIVEKIT_API_URL` do. This is a small code change, and Compose and kind need it too. On AWS, real S3 is reachable from both sides, so it stays unset.
> 2. Stage-1 workaround: name the S3 container `s3`, publish `8333:8333`, add `127.0.0.1 s3` to your machine's hosts file (on WSL, the **Windows** hosts file), and set `S3_ENDPOINT=http://s3:8333`.

## `deploy/docker-run/up.sh`

This replaces the manual `docker run` block in the [README](../README.md#how-to-run) and turns it into one command. It should:

1. Create the `nexusdrive` network (if missing).
2. Start the infrastructure containers (Keycloak, Postgres, Redis, SeaweedFS, LiveKit, draw.io) on that network, with named volumes for Postgres and S3 data.
3. Wait for Keycloak and Postgres to be ready, then create the bucket and the test users (same commands as the README).
4. Start user-service, then file-service and chat-service, then web, passing config with `-e` or `--env-file`. Keep env files for containers in `deploy/docker-run/` (e.g. `file-service.env`), separate from the `.env` files used by `npm run dev`.

`down.sh` removes the containers and the network. Add a flag that also deletes the volumes.

## Done when

- [ ] All four images build from the repo root with the commands above
- [ ] `./deploy/docker-run/up.sh` on a clean machine (Docker only, no Node) brings up the whole app
- [ ] `curl localhost:3001/ready`, `:3002/ready` and `:3003/ready` all report ready
- [ ] The walkthrough in the README's "Try it out" works at http://localhost:5173: login, upload/download, chat between two windows, a meeting
- [ ] `docker run --rm --entrypoint id nexusdrive/file-service:<tag>` doesn't print `uid=0`
- [ ] `hadolint` passes on every Dockerfile, and `trivy image` shows no unfixed CRITICAL vulnerabilities
- [ ] `docker stop` on a service takes about 1 s, not the 10 s timeout (SIGTERM is handled)
- [ ] The results table below is filled in

## Results (fill in)

Record these for the final presentation. They show the improvement from each optimisation.

| Image        | First working size | Final size | Build (cold / cached) | Start until `/ready` |
| ------------ | ------------------ | ---------- | --------------------- | -------------------- |
| file-service |                    |            |                       |                      |
| chat-service |                    |            |                       |                      |
| user-service |                    |            |                       |                      |
| web          |                    |            |                       |                      |
