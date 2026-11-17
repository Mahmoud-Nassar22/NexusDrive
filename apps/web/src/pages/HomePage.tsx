import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatSize, listFiles, type FileListing } from '../api/files';
import { getMe, ROLE_LABEL, visibilityText, type Me } from '../api/me';
import { listMeetings, timeAgo, type Meeting } from '../api/meetings';
import { useAuth } from '../auth/auth-context';
import { Icon, type IconName } from '../components/Icon';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const ACTIONS: { to: string; icon: IconName; title: string; text: string }[] = [
  { to: '/files', icon: 'upload', title: 'Upload a file', text: 'Add documents to your space' },
  {
    to: `/diagram/new`,
    icon: 'diagram',
    title: 'New diagram',
    text: 'Open the diagram editor',
  },
  { to: '/chat', icon: 'chat', title: 'Open chat', text: 'Talk to your team' },
  { to: '/meet', icon: 'video', title: 'Start a meeting', text: 'Video call in one click' },
];

export function HomePage() {
  const { user, hasRole } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [files, setFiles] = useState<FileListing | null>(null);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  useEffect(() => {
    // Each panel loads on its own, so one slow service doesn't blank the page.
    getMe().then(setMe, () => setMe(null));
    listFiles().then(setFiles, () => setFiles(null));
    listMeetings().then(setMeetings, () => setMeetings(null));
  }, []);

  const mine = files?.files.filter((f) => f.mine).length;
  const recent = files?.files.slice(0, 5) ?? [];
  const membership = me?.department ?? files?.membership;

  return (
    <section className="home">
      <div className="welcome card">
        <div>
          <h1>
            {greeting()}, {user.firstName || user.username}
          </h1>
          <p className="muted">{visibilityText(membership)}</p>
        </div>
        <div className="badges">
          {membership && (
            <>
              <span className="badge">
                <Icon name="building" size={14} /> {membership.departmentName}
              </span>
              <span className={`badge role-${membership.role}`}>{ROLE_LABEL[membership.role]}</span>
            </>
          )}
          {hasRole('admin') && <span className="badge role-admin">Platform admin</span>}
        </div>
      </div>

      <div className="stats">
        <Link to="/files" className="card stat">
          <span className="stat-value">{mine ?? '–'}</span>
          <span className="muted">Your files</span>
        </Link>
        <Link to="/files" className="card stat">
          <span className="stat-value">{files ? files.files.length : '–'}</span>
          <span className="muted">Files you can see</span>
        </Link>
        <Link to="/meet" className="card stat">
          <span className="stat-value">
            {meetings ? meetings.length : '–'}
            {!!meetings?.length && <span className="live-dot" />}
          </span>
          <span className="muted">Live meetings</span>
        </Link>
      </div>

      <h2>Quick actions</h2>
      <div className="grid">
        {ACTIONS.map((a) => (
          <Link key={a.title} to={a.to} className="card action">
            <span className="feature-icon">
              <Icon name={a.icon} />
            </span>
            <span>
              <strong>{a.title}</strong>
              <br />
              <span className="muted">{a.text}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="columns">
        <div className="card">
          <div className="card-head">
            <h2>Recent files</h2>
            <Link to="/files">View all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted">No files yet.</p>
          ) : (
            <ul className="list">
              {recent.map((f) => (
                <li key={`${f.owner.sub}/${f.name}`}>
                  <span className="list-main">
                    <Icon name={f.name.endsWith('.drawio') ? 'diagram' : 'files'} size={16} />{' '}
                    {f.name}
                  </span>
                  <span className="muted">
                    {f.mine ? 'you' : f.owner.username} · {formatSize(f.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Live meetings</h2>
            <Link to="/meet">All meetings</Link>
          </div>
          {!meetings?.length ? (
            <p className="muted">No meetings right now.</p>
          ) : (
            <ul className="list">
              {meetings.slice(0, 5).map((m) => (
                <li key={m.room}>
                  <span className="list-main">
                    <span className="live-dot" /> {m.title}
                  </span>
                  <span className="muted">
                    {m.participants} in · {timeAgo(m.startedAt)}
                  </span>
                  <Link className="button small" to={`/meet?join=${encodeURIComponent(m.room)}`}>
                    Join
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
