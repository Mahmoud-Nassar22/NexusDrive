import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { ChatPage } from './pages/ChatPage';
import { DiagramPage } from './pages/DiagramPage';
import { FilesPage } from './pages/FilesPage';

// LiveKit is large; only download it when someone opens a meeting.
const MeetingPage = lazy(() =>
  import('./pages/MeetingPage').then((m) => ({ default: m.MeetingPage })),
);

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/files" replace />} />
        <Route path="files" element={<FilesPage />} />
        <Route path="diagram/:name" element={<DiagramPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route
          path="meet"
          element={
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <MeetingPage />
            </Suspense>
          }
        />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/files" replace />} />
      </Route>
    </Routes>
  );
}
