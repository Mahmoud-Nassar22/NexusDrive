# chat-service

Chat rooms with department-based access over socket.io, plus the LiveKit meetings board.

| Type      | Path / event                     | Description                                                                                                                  |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| WebSocket | `/api/chat/socket.io`            | Connect with `auth: { token }` (Keycloak access token)                                                                       |
| event     | `join` `{ room, token? }`        | Joins if allowed; ack `{ ok: true, room, history }` or `{ ok: false, error }`. Send a fresh `token` (sockets outlive tokens) |
| event     | `leave` `{ room }`               | Leaves a room                                                                                                                |
| event     | `message` `{ room, text }`       | Broadcasts `message` to everyone in the room                                                                                 |
| GET       | `/api/chat/rooms`                | Every room with `canJoin` / `canManage`, plus where the caller may create rooms                                              |
| POST      | `/api/chat/rooms`                | Body `{ title, departmentId?, minRole }`: admins anywhere, department heads in their own department                          |
| DELETE    | `/api/chat/rooms/:id`            | Delete a room and its history (admins; heads for their department's rooms)                                                   |
| GET       | `/api/chat/rooms/:id/messages`   | Recent messages, if the caller may join                                                                                      |
| GET       | `/api/chat/meetings`             | Running meetings: `{ room, title, createdBy, participants, startedAt }`                                                      |
| POST      | `/api/chat/meetings`             | Body `{ title }`: starts a meeting; returns `{ meeting, serverUrl, token }`                                                  |
| POST      | `/api/chat/meetings/:room/token` | Join a running meeting (404 if it ended): `{ meeting, serverUrl, token }`                                                    |
| GET       | `/health` `/ready` `/metrics`    | Probes and metrics (`/ready` checks Postgres, and Redis when configured)                                                     |

## Room access

A room is either company-wide or for one department, plus the lowest department role allowed in (`worker` = everyone in it, `lead` = team leaders and head, `head` = head only). A company-wide `lead` or `head` room admits team leaders/heads of any department. A company-wide **General** room always exists and can't be deleted. The caller's department comes from user-service (`USER_SERVICE_URL`, called with the caller's token); if it is unreachable, only company-wide rooms open to everyone can be joined. Platform admins manage rooms but get no extra access to conversations.

## Storage and scaling

- `DATABASE_URL` (required): rooms and history in Postgres (`chat_rooms`, `chat_messages`, created on first use).
- `REDIS_URL` (optional): socket.io Redis adapter, so messages reach users connected to other replicas. Without it, run one replica.

The web app connects with the WebSocket transport only, so several replicas behind the Ingress need no sticky sessions.

Meetings are LiveKit rooms created through LiveKit's room API (`LIVEKIT_API_URL`, or `LIVEKIT_URL` with `ws` → `http`). `LIVEKIT_URL` itself is returned to browsers, so in production it must be the public `wss://` address.

**TODO:** a migration tool once the schema changes; history paging beyond the last 100 messages.

```bash
cp .env.example .env
npm run dev     # from this folder, or `npm run dev:chat` at the repo root
npm test
```
