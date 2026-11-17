# file-service

Per-user file storage on S3. It replaces the old Flask `file-service`: the same idea (per-user upload/list/download behind auth), but files live in S3 instead of a local volume. That means any number of replicas can run.

| Method | Path                                        | Description                                                                                           |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/api/files`                                | The caller's files plus those of people they may see (department rules), each with `owner` and `mine` |
| POST   | `/api/files/upload-url`                     | Body `{ filename, contentType?, size? }` returns a presigned PUT URL                                  |
| GET    | `/api/files/:name/download-url?owner=<sub>` | Presigned GET URL; `owner` (default: caller) must be someone the caller may see                       |
| DELETE | `/api/files/:name`                          | Delete one of the caller's own files                                                                  |
| GET    | `/health` `/ready` `/metrics`               | Probes and metrics (`/ready` checks the S3 bucket)                                                    |

Objects are stored as `users/<keycloak sub>/<sanitized filename>`. Who may see whose files is decided by user-service (`USER_SERVICE_URL`), which file-service calls with the caller's own token. If it is down, the listing shows only the caller's own files and downloads of other people's files return 503.

**TODO:** file metadata in Postgres (folders, sharing, quotas). The S3 bucket needs CORS allowing GET/PUT from the app origin (an infrastructure setting).

```bash
cp .env.example .env
npm run dev     # from this folder, or `npm run dev:files` at the repo root
npm test
```
