import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Icon, Logo, type IconName } from './Icon';

const LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/files', label: 'Files', icon: 'files' },
  { to: '/chat', label: 'Chat', icon: 'chat' },
  { to: '/meet', label: 'Meetings', icon: 'video' },
];

export function Layout() {
  const { user, hasRole, logout } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <Logo /> NexusDrive
        </NavLink>
        <nav>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              <Icon name={l.icon} size={18} /> <span>{l.label}</span>
            </NavLink>
          ))}
          {hasRole('admin') && (
            <NavLink to="/admin">
              <Icon name="shield" size={18} /> <span>Admin</span>
            </NavLink>
          )}
        </nav>
        <span className="user">
          <span className="avatar" aria-hidden="true">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="username">{user.username}</span>
          <button className="button secondary small" onClick={logout}>
            Sign out
          </button>
        </span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
