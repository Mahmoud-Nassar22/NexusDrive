# chat-service

Realtime chat over socket.io, plus LiveKit tokens for video meetings.

| Type      | Path / event                     | Description                                                           |
| --------- | -------------------------------- | --------------------------------------------------------------------- |
| WebSocket | `/api/chat/socket.io`            | Connect with `auth: { token }` (Keycloak access token)                |
| event     | `join` `{ room }`                | Joins a room; the ack returns `{ room, history }`                     |
| event     | `message` `{ room, text }`       | Broadcasts `message` to everyone in the room                          |
| GET       | `/api/chat/rooms/:room/messages` | Recent messages                                                       |
| POST      | `/api/chat/meetings/:room/token` | `{ serverUrl, token }` for `livekit-client`                           |
| GET       | `/health` `/ready` `/metrics`    | Probes and metrics (`/ready` checks Postgres / Redis when configured) |

## Storage and scaling

| Variable       | Set                                                                       | Empty                                         |
| -------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `DATABASE_URL` | History in Postgres table `chat_messages` (created on first use)          | History in memory, lost on restart            |
| `REDIS_URL`    | socket.io Redis adapter: messages reach users connected to other replicas | Rooms are local to one process: run 1 replica |

The web app connects with the WebSocket transport only, so several replicas behind the Ingress need no sticky sessions.

**TODO:** a migration tool once the schema changes; history paging beyond the last 100 messages.

```bash
cp .env.example .env
npm run dev     # from this folder, or `npm run dev:chat` at the repo root
npm test
```
