import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteFile,
  formatSize,
  getDownloadUrl,
  listFiles,
  uploadFile,
  type FileEntry,
  type FileListing,
} from '../api/files';
import { visibilityText } from '../api/me';
import { Icon } from '../components/Icon';

type Filter = 'all' | 'mine' | 'others';

export function FilesPage() {
  const [listing, setListing] = useState<FileListing | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setListing(await listFiles());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(() => uploadFile(file, file.name));
  }

  async function onDownload(f: FileEntry) {
    try {
      window.location.assign(await getDownloadUrl(f.name, f.mine ? undefined : f.owner.sub));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const files = listing?.files ?? [];
  const hasOthers = files.some((f) => !f.mine);
  const shown = files.filter((f) =>
    filter === 'mine' ? f.mine : filter === 'others' ? !f.mine : true,
  );

  return (
    <section>
      <div className="page-head">
        <h1>Files</h1>
        <label className={`button ${busy ? 'disabled' : ''}`}>
          <Icon name="upload" size={16} /> Upload
          <input type="file" hidden onChange={onUpload} disabled={busy} />
        </label>
        <Link className="button secondary" to="/diagram/new">
          <Icon name="plus" size={16} /> New diagram
        </Link>
      </div>

      {listing && (
        <p className={`banner ${listing.limited ? 'warn' : ''}`}>
          {listing.limited
            ? 'Department permissions are unavailable right now; showing only your own files.'
            : visibilityText(listing.membership)}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {hasOthers && (
        <div className="segmented" role="tablist">
          {(
            [
              ['all', 'All'],
              ['mine', 'Mine'],
              ['others', 'My people'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {listing && shown.length === 0 ? (
        <div className="empty card">
          <Icon name="files" size={28} />
          <p>No files here yet. Upload one or start a diagram.</p>
        </div>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Size</th>
                <th>Modified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <tr key={`${f.owner.sub}/${f.name}`}>
                  <td className="file-name">
                    <Icon name={f.name.endsWith('.drawio') ? 'diagram' : 'files'} size={16} />{' '}
                    {f.name}
                  </td>
                  <td>{f.mine ? <span className="muted">You</span> : f.owner.username}</td>
                  <td>{formatSize(f.size)}</td>
                  <td>{f.lastModified ? new Date(f.lastModified).toLocaleString() : ''}</td>
                  <td className="actions">
                    {f.mine && f.name.endsWith('.drawio') && (
                      <Link
                        className="button secondary small"
                        to={`/diagram/${encodeURIComponent(f.name)}`}
                      >
                        Edit
                      </Link>
                    )}
                    <button className="button secondary small" onClick={() => void onDownload(f)}>
                      Download
                    </button>
                    {f.mine && (
                      <button
                        className="button danger small"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Delete ${f.name}?`)) void run(() => deleteFile(f.name));
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
