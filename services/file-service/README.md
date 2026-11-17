# file-service

Per-user file storage on S3. It replaces the old Flask `file-service`: the same idea (per-user upload/list/download behind auth), but files live in S3 instead of a local volume. That means any number of replicas can run.

| Method | Path                            | Description                                                          |
| ------ | ------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/files`                    | List the caller's files                                              |
| POST   | `/api/files/upload-url`         | Body `{ filename, contentType?, size? }` returns a presigned PUT URL |
| GET    | `/api/files/:name/download-url` | Presigned GET URL                                                    |
| DELETE | `/api/files/:name`              | Delete a file                                                        |
| GET    | `/health` `/ready` `/metrics`   | Probes and metrics (`/ready` checks the S3 bucket)                   |

Objects are stored as `users/<keycloak sub>/<sanitized filename>`.

**TODO:** file metadata in Postgres (folders, sharing, quotas), and S3 bucket CORS for the app origin.

```bash
cp .env.example .env
npm run dev     # from this folder, or `npm run dev:files` at the repo root
npm test
```
