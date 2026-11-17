import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  joinMeeting,
  listMeetings,
  startMeeting,
  timeAgo,
  type JoinInfo,
  type Meeting,
} from '../api/meetings';
import { Icon } from '../components/Icon';

const REFRESH_MS = 5000;

/**
 * The meetings board: every running meeting is a tile with a Join button.
 * Starting a meeting creates a LiveKit room; joining gets a token from
 * chat-service and connects to LiveKit directly.
 */
export function MeetingPage() {
  const [params, setParams] = useSearchParams();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [active, setActive] = useState<JoinInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoJoined = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setMeetings(await listMeetings());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const enter = useCallback(async (action: () => Promise<JoinInfo>) => {
    setBusy(true);
    try {
      setActive(await action());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  // Keep the board fresh while it's visible.
  useEffect(() => {
    if (active) return;
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  // /meet?join=<room> (from the home page) joins straight away.
  useEffect(() => {
    const room = params.get('join');
    if (room && !autoJoined.current) {
      autoJoined.current = true;
      setParams({}, { replace: true });
      void enter(() => joinMeeting(room));
    }
  }, [params, setParams, enter]);

  function onStart(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) void enter(() => startMeeting(title.trim()));
  }

  if (active) {
    return (
      <section className="meeting-shell">
        <div className="page-head">
          <h1>
            <span className="live-dot" /> {active.meeting.title}
          </h1>
          <button className="button danger" onClick={() => setActive(null)}>
            Leave
          </button>
        </div>
        <LiveKitRoom
          className="meeting"
          serverUrl={active.serverUrl}
          token={active.token}
          connect
          video
          audio
          data-lk-theme="default"
          onDisconnected={() => setActive(null)}
        >
          <VideoConference />
        </LiveKitRoom>
      </section>
    );
  }

  return (
    <section>
      <div className="page-head">
        <h1>Meetings</h1>
      </div>

      <form className="card start-meeting" onSubmit={onStart}>
        <span className="feature-icon">
          <Icon name="video" />
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title, e.g. Weekly sync"
          maxLength={80}
        />
        <button type="submit" className="button" disabled={busy || !title.trim()}>
          Start meeting
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <h2>
        Happening now <span className="muted">({meetings?.length ?? 0})</span>
      </h2>
      {meetings && meetings.length === 0 ? (
        <div className="empty card">
          <Icon name="video" size={28} />
          <p>No meetings right now. Start one above and it will show up here for everyone.</p>
        </div>
      ) : (
        <div className="grid">
          {meetings?.map((m) => (
            <article key={m.room} className="card meeting-tile">
              <div className="tile-top">
                <span className="badge live">
                  <span className="live-dot" /> Live
                </span>
                <span className="muted">{timeAgo(m.startedAt)}</span>
              </div>
              <h3>{m.title}</h3>
              <p className="muted">
                {m.createdBy ? `Started by ${m.createdBy} · ` : ''}
                {m.participants} {m.participants === 1 ? 'person' : 'people'} in the call
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => void enter(() => joinMeeting(m.room))}
              >
                Join
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
