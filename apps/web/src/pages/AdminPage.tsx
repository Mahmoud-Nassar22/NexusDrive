import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { listDepartments, removeMember, setMember, type Department } from '../api/departments';
import { ROLE_LABEL, type DepartmentRole } from '../api/me';
import { listUsers, setAdmin, setEnabled, type UserSummary } from '../api/users';
import { useAuth } from '../auth/auth-context';
import { DepartmentsPanel } from './DepartmentsPanel';

type Tab = 'users' | 'departments';

/** Admin area: users (through user-service → Keycloak) and the company's departments. */
export function AdminPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<Tab>('departments');

  if (!hasRole('admin')) {
    return <p className="error">Admins only.</p>;
  }

  return (
    <section>
      <div className="page-head">
        <h1>Administration</h1>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['departments', 'Departments'],
            ['users', 'Users'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'users' ? <UsersPanel /> : <DepartmentsPanel />}
    </section>
  );
}

function UsersPanel() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
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
    void refresh();
    listDepartments().then(setDepartments, (e: Error) => setError(e.message));
  }, [refresh]);

  /** Moves a user to a department (or out of all), or changes their role there. */
  async function placeUser(u: UserSummary, departmentId: string, role: DepartmentRole) {
    setBusy(true);
    try {
      if (!departmentId) {
        if (u.department) await removeMember(u.department.departmentId, u.id);
      } else {
        // Keep their team leader when only the department stays the same and they stay a worker.
        const keepLead =
          u.department?.departmentId === departmentId && role === 'worker'
            ? u.department.leadId
            : null;
        await setMember(departmentId, u.id, role, keepLead);
      }
      await refresh(search.trim());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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

  return (
    <>
      <form className="row" onSubmit={onSearch}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username, email or name"
        />
        <button type="submit" className="button">
          Search
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {users.length === 0 ? (
        <p className="muted">No users found.</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Department</th>
                <th>Platform role</th>
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
                    <td>
                      <div className="placement">
                        <select
                          aria-label={`Department of ${u.username}`}
                          value={u.department?.departmentId ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            void placeUser(u, e.target.value, u.department?.role ?? 'worker')
                          }
                        >
                          <option value="">No department</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        {u.department && (
                          <select
                            aria-label={`Role of ${u.username}`}
                            value={u.department.role}
                            disabled={busy}
                            onChange={(e) =>
                              void placeUser(
                                u,
                                u.department!.departmentId,
                                e.target.value as DepartmentRole,
                              )
                            }
                          >
                            {(['head', 'lead', 'worker'] as const).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td>{u.isAdmin ? <span className="badge role-admin">admin</span> : 'user'}</td>
                    <td className={u.enabled ? '' : 'muted'}>
                      {u.enabled ? 'active' : 'disabled'}
                    </td>
                    <td className="actions">
                      <button
                        className="button secondary small"
                        disabled={busy || self}
                        onClick={() => void update(() => setAdmin(u.id, !u.isAdmin))}
                      >
                        {u.isAdmin ? 'Remove admin' : 'Make admin'}
                      </button>
                      <button
                        className={`button small ${u.enabled ? 'danger' : 'secondary'}`}
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
        </div>
      )}
    </>
  );
}
