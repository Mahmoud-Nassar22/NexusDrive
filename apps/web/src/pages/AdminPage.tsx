import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { listUsers, setAdmin, setEnabled, type UserSummary } from '../api/users';
import { useAuth } from '../auth/auth-context';
import { config } from '../config';

/**
 * User management through user-service (which calls the Keycloak Admin API).
 * Passwords, MFA and everything else stay in the Keycloak console.
 */
export function AdminPage() {
  const { user: me, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (query = '') => {
    try {
      setUsers(await listUsers(query));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  if (!isAdmin) {
    return <p className="error">Admins only.</p>;
  }

  async function update(action: () => Promise<UserSummary>) {
    setBusy(true);
    try {
      const updated = await action();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void refresh(search.trim());
  }

  const consoleUrl = `${config.keycloakUrl}/admin/${config.realm}/console/#/${config.realm}/users`;
  return (
    <section>
      <div className="toolbar">
        <h1>Users</h1>
        <a className="button secondary" href={consoleUrl} target="_blank" rel="noreferrer">
          Keycloak console
        </a>
      </div>
      <form className="row" onSubmit={onSearch}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username, email or name"
        />
        <button type="submit">Search</button>
      </form>
      {error && <p className="error">{error}</p>}
      {users.length === 0 ? (
        <p className="muted">No users found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me.sub;
              return (
                <tr key={u.id}>
                  <td>
                    {u.username}
                    {self && <span className="muted"> (you)</span>}
                  </td>
                  <td>{u.email ?? ''}</td>
                  <td>{u.isAdmin ? 'admin' : 'user'}</td>
                  <td className={u.enabled ? '' : 'muted'}>{u.enabled ? 'active' : 'disabled'}</td>
                  <td className="actions">
                    <button
                      disabled={busy || self}
                      onClick={() => void update(() => setAdmin(u.id, !u.isAdmin))}
                    >
                      {u.isAdmin ? 'Remove admin' : 'Make admin'}
                    </button>
                    <button
                      disabled={busy || self}
                      onClick={() => void update(() => setEnabled(u.id, !u.enabled))}
                    >
                      {u.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
