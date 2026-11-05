# SimpleCloud — a simplified Nextcloud-style app for DevOps practice

A small, real, multi-service application (not a wrapper around the official
Nextcloud image) built specifically so every container, pipeline stage and
Kubernetes manifest in this repo reflects genuine work our team did.

Inspired by Nextcloud's core idea (auth + personal file storage behind a web
UI), rebuilt at a scope a 6-person beginner-DevOps team can own end to end.

## Services

| Service | What it does | Port |
|---|---|---|
| `auth-service` | Register/login, issues JWTs, verifies tokens | 5001 |
| `file-service` | Per-user file upload/list/download, checks tokens with auth-service | 5002 |
| `frontend` | Web UI (login, register, upload, file list) calling the two services above | 5000 (exposed as 8080) |

Each service has its own Dockerfile, its own `requirements.txt`, and talks to
the others only over HTTP — a genuine (if small) microservice architecture.

## Running locally

```bash
cp .env.example .env     # fill in real secrets
docker compose up --build
# visit http://localhost:8080
```

Flow: register an account → log in → upload a file → see it listed → download it.
This has been tested end-to-end (register/login/upload/list/download/unauthorized-check
all verified against the running services before this repo was handed off).

## CI/CD pipeline (Jenkinsfile)

1. Checkout
2. Validate `docker-compose.yml`
3. Build all three images
4. Deploy the stack
5. Health-check all three `/health` endpoints
6. Smoke test: register → login → upload → list, against the live containers
7. (Optional) Tag and push images to Docker Hub

## Kubernetes (target architecture)

- `auth-service` — Deployment (1 replica) + PVC for its SQLite file + Service
- `file-service` — Deployment (2 replicas) + PVC for uploaded files + Service
- `frontend` — Deployment (2 replicas) + Service + Ingress
- `simplecloud-secrets` — Secret holding `JWT_SECRET` and `FRONTEND_SECRET`

**Known real-world caveat worth mentioning in your presentation**: `file-service`
runs 2 replicas backed by a single `ReadWriteOnce` PVC, which only reliably
mounts to one node in a real multi-node cluster. For a real production system
you'd move to shared storage (NFS, EFS, or S3-compatible object storage) or
run file-service as a single replica. Flagging this honestly is a stronger
look than hiding it — it shows you understand the trade-off, which is exactly
what DevOps judges want to see.

## Team split suggestion

- auth-service owner(s)
- file-service owner(s)
- frontend owner(s)
- CI/CD (Jenkinsfile) owner
- Kubernetes manifests owner
- Docs / diagrams / demo owner

## Security notes (mention these — they show maturity)

- Passwords are hashed with Werkzeug's `generate_password_hash` (PBKDF2), never stored in plaintext
- JWTs expire after 4 hours
- `file-service` never trusts a request without first verifying the token with `auth-service`
- Real secrets live only in `.env` (git-ignored) or the Kubernetes Secret — never committed
