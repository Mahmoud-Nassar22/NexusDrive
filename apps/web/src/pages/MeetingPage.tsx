import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';

interface JoinInfo {
  room: string;
  serverUrl: string;
  token: string;
}

/** Gets a LiveKit token from chat-service, then connects to the LiveKit server directly. */
export function MeetingPage() {
  // Chat links here with ?room=<chat room>, so a chat room and its meeting share a name.
  const [params] = useSearchParams();
  const [room, setRoom] = useState(params.get('room') ?? 'team-standup');
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(e: FormEvent) {
    e.preventDefault();
    try {
      setJoin(
        await apiFetch<JoinInfo>(`/api/chat/meetings/${encodeURIComponent(room)}/token`, {
          method: 'POST',
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (join) {
    return (
      <LiveKitRoom
        className="meeting"
        serverUrl={join.serverUrl}
        token={join.token}
        connect
        video
        audio
        data-lk-theme="default"
        onDisconnected={() => setJoin(null)}
      >
        <VideoConference />
      </LiveKitRoom>
    );
  }

  return (
    <section>
      <h1>Meetings</h1>
      {error && <p className="error">{error}</p>}
      <form className="row" onSubmit={start}>
        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="room name" />
        <button type="submit">Join meeting</button>
      </form>
    </section>
  );
}
