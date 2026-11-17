# chat-service

Realtime chat over socket.io, plus LiveKit tokens for video meetings.

| Type      | Path / event                     | Description                                            |
| --------- | -------------------------------- | ------------------------------------------------------ |
| WebSocket | `/api/chat/socket.io`            | Connect with `auth: { token }` (Keycloak access token) |
| event     | `join` `{ room }`                | Joins a room; the ack returns `{ room, history }`      |
| event     | `message` `{ room, text }`       | Broadcasts `message` to everyone in the room           |
| GET       | `/api/chat/rooms/:room/messages` | Recent messages                                        |
| POST      | `/api/chat/meetings/:room/token` | `{ serverUrl, token }` for `livekit-client`            |
| GET       | `/health` `/ready` `/metrics`    | Probes and metrics                                     |

**TODO:**

- Store message history in Postgres (`DATABASE_URL`).
- Add the `@socket.io/redis-adapter` (`REDIS_URL`) so several replicas share rooms. Until then, run **one replica**, or use sticky sessions.

```bash
cp .env.example .env
npm run dev     # from this folder, or `npm run dev:chat` at the repo root
npm test
```
