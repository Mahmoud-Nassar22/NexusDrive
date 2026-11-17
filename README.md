# ☁️ NexusDrive

A private cloud platform for file storage and collaboration (files, diagrams, chat and video meetings), built as a set of microservices and run on **Kubernetes (Amazon EKS)**.

> DevOps graduation project. The focus is on how the system is built, shipped, secured and operated.

![Architecture](arch/nexusdrive-architecture.svg)

---

## Application architecture

| Component               | Tech                      | Responsibility                                                             |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `apps/web`              | React + Vite (TypeScript) | Landing page, home dashboard, files, diagrams, chat, meetings board, admin |
| `services/file-service` | NestJS                    | Files on S3 through presigned URLs; visibility by department role          |
| `services/chat-service` | NestJS + socket.io        | Realtime chat (Postgres history, Redis fan-out); LiveKit meetings board    |
| `services/user-service` | NestJS                    | Users (via Keycloak Admin API) and departments (Postgres)                  |
| Keycloak                | upstream                  | Login, SSO, MFA, users and roles (OIDC)                                    |
| draw.io                 | upstream                  | Embedded diagram editor; diagrams saved to S3                              |
| LiveKit                 | upstream                  | WebRTC video/audio meetings                                                |
| PostgreSQL · Redis · S3 | managed on AWS            | Data, cache / pub-sub, file storage                                        |

- Every service validates **Keycloak JWTs** and exposes `/health`, `/ready` and `/metrics`. Logs are JSON, and all config comes from env vars. See [docs/service-contract.md](docs/service-contract.md).
- File bytes go **browser ↔ S3 directly**. Services only sign the URLs.

More detail: [docs/architecture.md](docs/architecture.md). Deploying it: [docs/deployment-notes.md](docs/deployment-notes.md).

## Deployment architecture

```
Users → DNS (Route53/Cloudflare) → AWS Load Balancer (TLS) → Ingress → EKS
  EKS namespaces
    app         web · file-service · chat-service · user-service · drawio · livekit (UDP via NLB)
    identity    keycloak
    platform    argo-cd · cert-manager · external-dns · external-secrets · aws-lb-controller
    monitoring  prometheus · grafana · loki
  AWS managed   RDS PostgreSQL · ElastiCache Redis · S3 · ECR · Secrets Manager
```

Everything is provisioned with Terraform. Pods reach AWS through IAM roles (IRSA), so there are no static keys.

## Planned DevOps features

| Area                   | Tools                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Infrastructure as Code | Terraform: VPC, EKS, RDS, S3, ECR, IAM                                                     |
| CI                     | GitHub Actions or Jenkins: lint, test, build, Trivy image scan, push to ECR                |
| CD / GitOps            | Helm charts per service, Argo CD, separate dev and prod environments                       |
| Networking             | Ingress, cert-manager (TLS), ExternalDNS, NetworkPolicies                                  |
| Secrets                | AWS Secrets Manager + External Secrets Operator                                            |
| Observability          | Prometheus, Grafana dashboards, Loki logs, Alertmanager                                    |
| Security               | Keycloak SSO/MFA, Pod Security Standards, least-privilege IAM, image scanning              |
| Reliability            | HPA autoscaling, PodDisruptionBudgets, RDS and Velero backups with a tested restore        |
| Cost control           | Local development on kind/k3d; AWS brought up for demos and torn down after; budget alarms |

## Repository layout

```
apps/web/              React frontend
services/              NestJS backend services
packages/common/       shared service code (auth, health, metrics, logging)
config/keycloak/       Keycloak realm (roles, web client)
docs/                  architecture, service contract, local development
arch/                  diagrams
```

## How to run

This runs the whole app on your machine: the backing services in Docker, and our code with Node.

**You need:** Node.js 22 (`nvm use` picks it up from `.nvmrc`), Docker, and free ports 3001–3003, 5173, 5432, 6379, 7880–7882, 8080, 8081 and 9000.

### 1. Start the backing services

Run from the repo root. These are throwaway local containers (named `nd-*`), not the deployment setup.

```bash
# Keycloak (login), with our realm imported. Admin console: http://localhost:8080 (admin / admin)
docker run -d --name nd-keycloak -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v "$PWD/config/keycloak:/opt/keycloak/data/import:ro" \
  quay.io/keycloak/keycloak:26.4 start-dev --import-realm

# Postgres (departments, chat) and Redis (chat fan-out)
docker run -d --name nd-postgres -p 5432:5432 \
  -e POSTGRES_USER=nexusdrive -e POSTGRES_PASSWORD=nexusdrive -e POSTGRES_DB=nexusdrive \
  postgres:17-alpine
docker run -d --name nd-redis -p 6379:6379 redis:7-alpine

# S3-compatible storage for files (SeaweedFS; MinIO no longer publishes images)
docker run -d --name nd-s3 -p 9000:8333 chrislusf/seaweedfs:latest server -s3 -dir=/data

# LiveKit (video meetings) and draw.io (diagram editor)
docker run -d --name nd-livekit -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server:latest --dev --bind 0.0.0.0 --node-ip 127.0.0.1
docker run -d --name nd-drawio -p 8081:8080 jgraph/drawio:latest
```

Wait about 30 seconds for Keycloak, then create the file bucket and some test users:

```bash
curl -X PUT http://localhost:9000/nexusdrive-files

K="docker exec nd-keycloak /opt/keycloak/bin/kcadm.sh"
$K config credentials --server http://localhost:8080 --realm master --user admin --password admin
for u in demo alice carol dave erin; do
  $K create users -r nexusdrive -s username=$u -s enabled=true \
     -s email=$u@nexusdrive.local -s emailVerified=true -s firstName=${u^} -s lastName=Test
  $K set-password -r nexusdrive --username $u --new-password $u
done
$K add-roles -r nexusdrive --uusername demo --rolename admin   # demo is the platform admin
```

Each user's password is the same as their username.

### 2. Install and configure

```bash
npm install
npm run build:common
cp services/file-service/.env.example services/file-service/.env
cp services/chat-service/.env.example services/chat-service/.env
cp services/user-service/.env.example services/user-service/.env
cp apps/web/.env.example apps/web/.env.local
```

The example settings already point at the containers above.

### 3. Start the app (four terminals)

```bash
npm run dev:users   # user-service  http://localhost:3003
npm run dev:files   # file-service  http://localhost:3001
npm run dev:chat    # chat-service  http://localhost:3002
npm run dev:web     # web app       http://localhost:5173
```

Open **http://localhost:5173** and sign in. The services reload when you save a file. To check that a service is up and connected, open its `/ready` URL, e.g. `curl localhost:3001/ready`.

### 4. Try it out

1. Sign in as **demo** (admin). Under **Admin → Departments**, create a department and add `carol` as head, `dave` as team leader, and `erin` as a worker in dave's team.
2. Sign in as each of them (use private windows) and upload a file. Carol sees everyone's files, dave sees his and erin's, and erin sees only her own.
3. **Chat:** as demo or carol, create rooms for the department or for team leaders only, then compare which rooms each user can join.
4. **Meetings:** start a meeting in one window and click **Join** on its tile in another.

### Stop or reset

```bash
docker rm -f nd-keycloak nd-postgres nd-redis nd-s3 nd-livekit nd-drawio   # removes all local data too
```

### Before opening a PR

```bash
npm run lint && npm test && npm run build
```

More detail (ports, every setting, troubleshooting): [docs/local-development.md](docs/local-development.md).

## 👥 Team

| #   | Team member     |
| --- | --------------- |
| 1   | Anas Elfeky     |
| 2   | Mahmoud Khaled  |
| 3   | Aser Ahmed      |
| 4   | Mohamed Bahaa   |
| 5   | Elsayed Mohamed |
| 6   | Ali Abdou       |

🚧 **Status:** under development. Application skeleton is in place; infrastructure and pipelines are next.

**NexusDrive Team © 2026**
