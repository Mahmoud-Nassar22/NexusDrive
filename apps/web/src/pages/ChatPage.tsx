import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import {
  audienceLabel,
  createRoom,
  deleteRoom,
  listRooms,
  type ChatMessage,
  type ChatRoom,
  type RoomListing,
} from '../api/chat';
import { listDepartments } from '../api/departments';
import { ROLE_LABEL, type DepartmentRole } from '../api/me';
import { timeAgo } from '../api/meetings';
import { getToken } from '../auth/keycloak';
import { Icon } from '../components/Icon';

type JoinAck = { ok: true; room: ChatRoom; history: ChatMessage[] } | { ok: false; error: string };

const REFRESH_MS = 10_000;

/**
 * The chat board: every room is a tile. Rooms the caller's department role
 * allows can be joined; the others show who they are for.
 */
export function ChatPage() {
  const socketRef = useRef<Socket | null>(null);
  const activeRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [listing, setListing] = useState<RoomListing | null>(null);
  const [active, setActive] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setListing(await listRooms());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  /** Joins with a fresh token: sockets live longer than access tokens. */
  const enter = useCallback(async (socket: Socket, roomId: string) => {
    const token = await getToken();
    socket.emit('join', { room: roomId, token }, (ack: JoinAck) => {
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      activeRef.current = ack.room.id;
      setActive({ ...ack.room, canJoin: true, canManage: false });
      setMessages(ack.history);
      setError(null);
    });
  }, []);

  useEffect(() => {
    // Same origin; the Ingress (or Vite proxy) routes /api/chat to chat-service.
    // WebSocket only (no long-polling), so several replicas work without sticky sessions.
    const socket = io({
      path: '/api/chat/socket.io',
      transports: ['websocket'],
      auth: (cb) => void getToken().then((token) => cb({ token })),
    });
    socket.on('connect', () => {
      setConnected(true);
      // After a reconnect (e.g. the pod restarted) the server forgot our room.
      if (activeRef.current) void enter(socket, activeRef.current);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('message', (m: ChatMessage) => {
      if (m.room === activeRef.current) setMessages((prev) => [...prev, m]);
    });
    socketRef.current = socket;
    return () => {
      socket.disconnect();
    };
  }, [enter]);

  // Keep the board fresh while it's visible.
  useEffect(() => {
    if (active) return;
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  function leave() {
    if (activeRef.current) socketRef.current?.emit('leave', { room: activeRef.current });
    activeRef.current = null;
    setActive(null);
    setMessages([]);
  }

  function send(e: FormEvent) {
    e.preventDefault();
    if (!active || !text.trim()) return;
    socketRef.current?.emit('message', { room: active.id, text });
    setText('');
  }

  async function onDelete(room: ChatRoom) {
    if (!confirm(`Delete "${room.title}" and its whole history?`)) return;
    try {
      await deleteRoom(room.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (active) {
    return (
      <section>
        <div className="page-head">
          <button className="button secondary" onClick={leave}>
            ← Rooms
          </button>
          <h1>
            {active.title} <span className="badge">{audienceLabel(active)}</span>
          </h1>
          <span className="muted">{connected ? 'connected' : 'reconnecting…'}</span>
          <Link
            className="button secondary"
            to={`/meet?title=${encodeURIComponent(`${active.title} call`)}`}
          >
            <Icon name="video" size={16} /> Start a meeting
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
        <ul className="messages">
          {messages.length === 0 && <li className="muted">No messages yet. Say hello!</li>}
          {messages.map((m) => (
            <li key={m.id}>
              <strong>{m.from}</strong>{' '}
              <span className="muted">{new Date(m.at).toLocaleTimeString()}</span>
              <div>{m.text}</div>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${active.title}`}
            maxLength={4000}
          />
          <button type="submit" className="button" disabled={!connected || !text.trim()}>
            Send
          </button>
        </form>
      </section>
    );
  }

  const canCreate = listing?.canCreate;
  return (
    <section>
      <div className="page-head">
        <h1>Chat</h1>
        <span className="muted">{connected ? 'connected' : 'connecting…'}</span>
      </div>

      {canCreate && (canCreate.anywhere || canCreate.department) && (
        <NewRoomForm canCreate={canCreate} onCreated={refresh} onError={setError} />
      )}
      {error && <p className="error">{error}</p>}

      <div className="grid">
        {listing?.rooms.map((r) => (
          <article key={r.id} className={`card room-tile ${r.canJoin ? '' : 'locked'}`}>
            <div className="tile-top">
              <span className="badge">
                {!r.canJoin && <Icon name="lock" size={12} />} {audienceLabel(r)}
              </span>
              {r.lastMessage && <span className="muted">{timeAgo(r.lastMessage.at)}</span>}
            </div>
            <h3>{r.title}</h3>
            <p className="muted preview">
              {!r.canJoin
                ? 'You don’t have access to this room.'
                : r.lastMessage
                  ? `${r.lastMessage.from}: ${r.lastMessage.text}`
                  : 'No messages yet.'}
            </p>
            <div className="tile-actions">
              <button
                className="button"
                disabled={!r.canJoin || !connected}
                onClick={() => socketRef.current && void enter(socketRef.current, r.id)}
              >
                Join
              </button>
              {r.canManage && r.id !== 'general' && (
                <button className="button danger small" onClick={() => void onDelete(r)}>
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const MIN_ROLE_LABEL: Record<DepartmentRole, string> = {
  worker: 'Everyone in it',
  lead: `${ROLE_LABEL.lead}s and head`,
  head: 'Head only',
};

/** Admins create rooms for anyone; department heads for their own department. */
function NewRoomForm({
  canCreate,
  onCreated,
  onError,
}: {
  canCreate: RoomListing['canCreate'];
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>(
    canCreate.department ? [canCreate.department] : [],
  );
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState(
    canCreate.anywhere ? '' : (canCreate.department?.id ?? ''),
  );
  const [minRole, setMinRole] = useState<DepartmentRole>('worker');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (canCreate.anywhere) {
      listDepartments().then(
        (ds) => setDepartments(ds.map((d) => ({ id: d.id, name: d.name }))),
        () => undefined,
      );
    }
  }, [canCreate.anywhere]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createRoom({ title: title.trim(), departmentId: departmentId || undefined, minRole });
      setTitle('');
      await onCreated();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card new-room" onSubmit={onSubmit}>
      <span className="feature-icon">
        <Icon name="chat" />
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New room, e.g. Release planning"
        maxLength={80}
      />
      <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
        {canCreate.anywhere && <option value="">Whole company</option>}
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select value={minRole} onChange={(e) => setMinRole(e.target.value as DepartmentRole)}>
        {(['worker', 'lead', 'head'] as const).map((r) => (
          <option key={r} value={r}>
            {departmentId
              ? MIN_ROLE_LABEL[r]
              : audienceLabel({ minRole: r, departmentId: undefined, departmentName: undefined })}
          </option>
        ))}
      </select>
      <button type="submit" className="button" disabled={busy || !title.trim()}>
        Create room
      </button>
    </form>
  );
}
