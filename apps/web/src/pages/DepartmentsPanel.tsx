import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  listDepartments,
  removeMember,
  renameDepartment,
  setMember,
  type Department,
  type DepartmentDetail,
  type DepartmentMember,
} from '../api/departments';
import { ROLE_LABEL, type DepartmentRole } from '../api/me';
import { listUsers, type UserSummary } from '../api/users';
import { Icon } from '../components/Icon';

const ROLES: DepartmentRole[] = ['head', 'lead', 'worker'];

/** Admin: create departments and place people in them as head, team leader or worker. */
export function DepartmentsPanel() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selected, setSelected] = useState<DepartmentDetail | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setDepartments(await listDepartments());
  }, []);

  useEffect(() => {
    Promise.all([refreshList(), listUsers().then(setUsers)]).catch((e: Error) =>
      setError(e.message),
    );
  }, [refreshList]);

  /** Runs a change, shows its error if any, then refreshes the list and users. */
  async function run(action: () => Promise<DepartmentDetail | void>) {
    setBusy(true);
    try {
      const detail = await action();
      if (detail) setSelected(detail);
      await Promise.all([refreshList(), listUsers().then(setUsers)]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      const d = await createDepartment(name);
      setNewName('');
      return d;
    });
  }

  return (
    <div className="split">
      <aside className="card dept-list">
        <form className="row" onSubmit={onCreate}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New department name"
            maxLength={80}
          />
          <button className="button" disabled={busy || !newName.trim()}>
            <Icon name="plus" size={16} />
          </button>
        </form>
        {departments.length === 0 && <p className="muted">No departments yet.</p>}
        <ul className="list selectable">
          {departments.map((d) => (
            <li key={d.id}>
              <button
                className={selected?.id === d.id ? 'active' : ''}
                onClick={() => void run(() => getDepartment(d.id))}
              >
                <span className="list-main">
                  <Icon name="building" size={16} /> {d.name}
                </span>
                <span className="muted">
                  {d.memberCount} {d.memberCount === 1 ? 'member' : 'members'}
                  {d.head ? ` · head: ${d.head.username}` : ' · no head'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="dept-detail">
        {error && <p className="error">{error}</p>}
        {selected ? (
          <DepartmentEditor
            key={selected.id}
            dept={selected}
            users={users}
            busy={busy}
            run={run}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <div className="empty card">
            <Icon name="building" size={28} />
            <p>Select a department, or create one, to manage its people.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DepartmentEditor({
  dept,
  users,
  busy,
  run,
  onDeleted,
}: {
  dept: DepartmentDetail;
  users: UserSummary[];
  busy: boolean;
  run: (action: () => Promise<DepartmentDetail | void>) => Promise<void>;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(dept.name);
  const [addUser, setAddUser] = useState('');
  const [addRole, setAddRole] = useState<DepartmentRole>('worker');

  const leads = dept.members.filter((m) => m.role === 'lead');
  const memberIds = new Set(dept.members.map((m) => m.userId));
  const candidates = users.filter((u) => !memberIds.has(u.id));

  function onRename(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && name.trim() !== dept.name) {
      void run(() => renameDepartment(dept.id, name.trim()));
    }
  }

  function onDelete() {
    if (confirm(`Delete ${dept.name}? Its members will no longer be in any department.`)) {
      void run(async () => {
        await deleteDepartment(dept.id);
        onDeleted();
      });
    }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!addUser) return;
    void run(async () => {
      const d = await setMember(dept.id, addUser, addRole);
      setAddUser('');
      return d;
    });
  }

  const change = (m: DepartmentMember, role: DepartmentRole, leadId?: string | null) =>
    void run(() => setMember(dept.id, m.userId, role, leadId));

  return (
    <div className="card">
      <form className="row" onSubmit={onRename}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button className="button secondary" disabled={busy || name.trim() === dept.name}>
          Rename
        </button>
        <button type="button" className="button danger" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </form>

      <p className="banner">
        File visibility narrows from the top down: the <strong>head</strong> sees everyone’s files,
        a <strong>team leader</strong> sees their team’s, a <strong>worker</strong> sees their own.
      </p>

      {dept.members.length === 0 ? (
        <p className="muted">No members yet. Add people below.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Team leader</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dept.members.map((m) => (
                <tr key={m.userId}>
                  <td>{m.username}</td>
                  <td>
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => change(m, e.target.value as DepartmentRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {m.role === 'worker' ? (
                      <select
                        value={m.leadId ?? ''}
                        disabled={busy}
                        onChange={(e) => change(m, 'worker', e.target.value || null)}
                      >
                        <option value="">No team</option>
                        {leads.map((l) => (
                          <option key={l.userId} value={l.userId}>
                            {l.username}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td className="actions">
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => void run(() => removeMember(dept.id, m.userId))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="row add-member" onSubmit={onAdd}>
        <select value={addUser} onChange={(e) => setAddUser(e.target.value)} disabled={busy}>
          <option value="">Add a person…</option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
              {u.department ? ` (moves from ${u.department.departmentName})` : ''}
            </option>
          ))}
        </select>
        <select
          value={addRole}
          onChange={(e) => setAddRole(e.target.value as DepartmentRole)}
          disabled={busy}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button className="button" disabled={busy || !addUser}>
          Add
        </button>
      </form>
    </div>
  );
}
