import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

export function Layout() {
  const { user, hasRole, logout } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">NexusDrive</strong>
        <nav>
          <NavLink to="/files">Files</NavLink>
          <NavLink to="/chat">Chat</NavLink>
          <NavLink to="/meet">Meetings</NavLink>
          {hasRole('admin') && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <span className="user">
          {user.username}
          <button onClick={logout}>Sign out</button>
        </span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
