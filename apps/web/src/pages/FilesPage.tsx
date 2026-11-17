import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { deleteFile, getDownloadUrl, listFiles, uploadFile, type FileEntry } from '../api/files';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function FilesPage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles());
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

  async function onDownload(name: string) {
    window.location.assign(await getDownloadUrl(name));
  }

  return (
    <section>
      <div className="toolbar">
        <h1>My files</h1>
        <label className="button">
          Upload
          <input type="file" hidden onChange={onUpload} disabled={busy} />
        </label>
        <Link
          className="button secondary"
          to={`/diagram/${encodeURIComponent(`diagram-${Date.now()}.drawio`)}`}
        >
          New diagram
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {files.length === 0 ? (
        <p className="muted">No files yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Modified</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{formatSize(f.size)}</td>
                <td>{f.lastModified ? new Date(f.lastModified).toLocaleString() : ''}</td>
                <td className="actions">
                  {f.name.endsWith('.drawio') && (
                    <Link to={`/diagram/${encodeURIComponent(f.name)}`}>Edit</Link>
                  )}
                  <button onClick={() => void onDownload(f.name)}>Download</button>
                  <button disabled={busy} onClick={() => void run(() => deleteFile(f.name))}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
