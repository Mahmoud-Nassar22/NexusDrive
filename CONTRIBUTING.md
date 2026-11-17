# Contributing

## Branches and pull requests

- Branch from `main` as `feature/<topic>`, `fix/<topic>` or `infra/<topic>`. Name branches after the work, not after a person.
- Open a PR into `main`. You need **one approving review** from someone else, and `npm run lint`, `npm test` and `npm run build` must pass.
- Keep PRs small: one service or one DevOps component per PR.
- Never commit secrets. `.env` files are git-ignored; only `.env.example` files are committed.

## Where things go

| Path              | Contents                                |
| ----------------- | --------------------------------------- |
| `apps/web`        | React frontend                          |
| `services/<name>` | NestJS backend services                 |
| `packages/common` | code shared by all services             |
| `config/`         | app configuration (e.g. Keycloak realm) |
| `docs/`           | architecture, service contract, how-tos |
| `arch/`           | diagrams                                |

DevOps tracks add their own top-level folders as they start, for example `infra/terraform`, `charts/`, `gitops/`, `.github/workflows` or `ci/`.

## Writing a service

Follow [docs/service-contract.md](docs/service-contract.md). The short version: health, ready and metrics endpoints; config from env; JSON logs; a Keycloak JWT on every API route.

## Style

TypeScript strict mode, Prettier (`npm run format`), ESLint (`npm run lint`).
