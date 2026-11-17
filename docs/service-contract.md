# Service contract

Every backend service in `services/` follows these rules. They let the DevOps tracks (Helm, probes, monitoring, secrets) treat all services the same way. Most of it comes for free from [`@nexusdrive/common`](../packages/common/src).

| Rule                                                                                                 | How                                                             |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Starts with `bootstrapService(AppModule, { globalPrefix, defaultPort })`                             | `packages/common/src/bootstrap.ts`                              |
| API lives under its Ingress prefix: `/api/<service>`                                                 | `globalPrefix` option                                           |
| `GET /health` (liveness) returns 200 if the process is up; never checks dependencies                 | `HealthModule`                                                  |
| `GET /ready` (readiness) returns 200 only when dependencies respond, otherwise 503                   | `ReadinessRegistry.register('name', check)`                     |
| `GET /metrics` serves Prometheus format, with default Node metrics + `http_request_duration_seconds` | `MetricsModule`                                                 |
| Logs are JSON lines to stdout, with `Authorization` and cookies redacted                             | `createLoggerModule('<service>')`                               |
| Config comes **only** from env vars, validated at startup (crash fast on bad config)                 | `src/config/env.ts` (zod)                                       |
| Every API route requires a Keycloak access token                                                     | `@UseGuards(JwtAuthGuard)`, `@CurrentUser()`, `@Roles('admin')` |
| Data is owned by the Keycloak user id (`sub`), never by username                                     | e.g. S3 keys `users/<sub>/…`                                    |
| Shuts down cleanly on SIGTERM                                                                        | `enableShutdownHooks()` in bootstrap                            |
| Each service has `.env.example` listing every variable it reads                                      |                                                                 |

## Ports and prefixes

| Service                   | Local port | Ingress path                              |
| ------------------------- | ---------- | ----------------------------------------- |
| web (Vite dev server)     | 5173       | `/`                                       |
| file-service              | 3001       | `/api/files`                              |
| chat-service              | 3002       | `/api/chat` (incl. `/api/chat/socket.io`) |
| Keycloak (upstream image) | 8080       | `/auth` or own host                       |
| draw.io (upstream image)  | 8081       | `/drawio` or own host                     |
| LiveKit (upstream image)  | 7880 + UDP | own host, NLB                             |

## Adding a new service

1. Copy `services/chat-service` and rename it (package name `@nexusdrive/<name>`).
2. Choose a port and an `/api/<name>` prefix, and add them to the table above.
3. Add the path to the proxy in `apps/web/vite.config.ts`.
4. Tell the CD track owner, who adds a Helm release and an Ingress path.
