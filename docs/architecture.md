# Architecture

![NexusDrive architecture](../arch/nexusdrive-architecture.svg)

The first hand-drawn version is [`arch/arch.jpeg`](../arch/arch.jpeg). The diagram above is the revised target.

## Components

| Component              | Code                               | What it does                                                                                                                                                      |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **web**                | `apps/web`                         | React + Vite single-page app: files, diagrams, chat, meetings, admin link. Logs in with Keycloak (OIDC + PKCE).                                                   |
| **file-service**       | `services/file-service`            | Lists a user's files and hands out short-lived **presigned S3 URLs**. The browser uploads and downloads directly to S3, so file bytes never pass through the pod. |
| **chat-service**       | `services/chat-service`            | Realtime chat rooms over socket.io, plus issuing **LiveKit tokens** for video meetings.                                                                           |
| **Keycloak**           | upstream image + `config/keycloak` | Login, registration, SSO, MFA, users and roles (`user`, `admin`). Replaces the old auth-service and the planned user-management service.                          |
| **draw.io**            | upstream image (`jgraph/drawio`)   | Diagram editor embedded in an iframe. Diagrams are saved to S3 as `.drawio` files through file-service.                                                           |
| **LiveKit**            | upstream image                     | WebRTC media server (SFU) for meetings. Needs UDP, so it's exposed with an NLB rather than the HTTP Ingress.                                                      |
| **@nexusdrive/common** | `packages/common`                  | Shared NestJS code: JWT guard, health/ready, metrics, logging, bootstrap. See [service-contract.md](service-contract.md).                                         |

## Main flows

**Login.** The browser is redirected to Keycloak and gets back an access token (JWT). Every API call sends `Authorization: Bearer <token>`. Services verify it locally against Keycloak's public keys (JWKS), so there's no call to an auth service per request.

**Upload a file.**

1. The browser calls `POST /api/files/upload-url`.
2. file-service returns a presigned PUT URL for `users/<sub>/<name>`.
3. The browser PUTs the file straight to S3.

Downloads work the same way with a presigned GET URL.

**Edit a diagram.** draw.io runs in an iframe. On load, the web app fetches the XML through a download URL. On save, it uploads the XML through an upload URL.

**Chat.** The browser opens socket.io at `/api/chat/socket.io` with its token, then joins a room and sends messages. History is in memory for now. Postgres comes next, and then a Redis adapter for running more than one replica.

**Meeting.**

1. The browser calls `POST /api/chat/meetings/<room>/token`.
2. It connects to LiveKit with that token.
3. Audio and video flow browser ↔ LiveKit over UDP.

## Why some boxes from the first drawing changed

- **Firebase was removed.** It's a Google SaaS and can't run in the cluster. Postgres and Redis cover chat storage and fan-out.
- **Auth Service + User Management were merged into Keycloak.** Writing auth yourselves is a security risk, and Keycloak gives SSO, MFA and an admin UI for free.
- **Jenkins moved out of the app cluster.** CI must not share a failure or security domain with production, and must never talk to the app database.
- **Draw.io is its own deployment**, not part of file management.
