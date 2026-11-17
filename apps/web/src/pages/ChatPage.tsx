import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { getToken } from '../auth/keycloak';

interface ChatMessage {
  id: string;
  room: string;
  text: string;
  from: string;
  at: string;
}

type JoinAck = { room: string; history: ChatMessage[] };

export function ChatPage() {
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState('general');
  const [joined, setJoined] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    function enter(socket: Socket, name: string) {
      socket.emit('join', { room: name }, (res: JoinAck) => {
        joinedRef.current = res.room;
        setJoined(res.room);
        setMessages(res.history);
      });
    }

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
      if (joinedRef.current) enter(socket, joinedRef.current);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('message', (m: ChatMessage) => setMessages((prev) => [...prev, m]));
    socketRef.current = socket;
    return () => {
      socket.disconnect();
    };
  }, []);

  function join(e: FormEvent) {
    e.preventDefault();
    socketRef.current?.emit('join', { room }, (res: JoinAck) => {
      joinedRef.current = res.room;
      setJoined(res.room);
      setMessages(res.history);
    });
  }

  function send(e: FormEvent) {
    e.preventDefault();
    if (!joined || !text.trim()) return;
    socketRef.current?.emit('message', { room: joined, text });
    setText('');
  }

  return (
    <section>
      <div className="toolbar">
        <h1>Chat</h1>
        <span className="muted">{connected ? 'connected' : 'connecting…'}</span>
      </div>
      <form className="row" onSubmit={join}>
        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="room name" />
        <button type="submit" disabled={!connected}>
          Join
        </button>
      </form>
      {joined && (
        <>
          <div className="row">
            <span className="muted">#{joined}</span>
            <Link className="button secondary" to={`/meet?room=${encodeURIComponent(joined)}`}>
              Start meeting in #{joined}
            </Link>
          </div>
          <ul className="messages">
            {messages
              .filter((m) => m.room === joined)
              .map((m) => (
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
              placeholder={`Message #${joined}`}
            />
            <button type="submit">Send</button>
          </form>
        </>
      )}
    </section>
  );
}
