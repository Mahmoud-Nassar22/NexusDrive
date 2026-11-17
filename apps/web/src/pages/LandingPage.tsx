import { login, register } from '../auth/keycloak';
import { Icon, Logo, type IconName } from '../components/Icon';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'files',
    title: 'Files',
    text: 'Upload and share documents. Heads and team leaders see their people’s work.',
  },
  {
    icon: 'diagram',
    title: 'Diagrams',
    text: 'Draw architecture and process diagrams in the browser, saved with your files.',
  },
  { icon: 'chat', title: 'Chat', text: 'Real-time rooms for teams and projects, with history.' },
  {
    icon: 'video',
    title: 'Meetings',
    text: 'Start a video call in one click; colleagues join from the meetings board.',
  },
  {
    icon: 'building',
    title: 'Departments',
    text: 'Model your company: departments, heads, team leaders and workers.',
  },
  {
    icon: 'lock',
    title: 'Private by design',
    text: 'Runs on your own cloud with single sign-on and multi-factor login.',
  },
];

/** Public page for visitors who are not signed in. */
export function LandingPage({ error }: { error?: string }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand">
          <Logo /> NexusDrive
        </span>
        <button className="button secondary" onClick={() => void login()}>
          Sign in
        </button>
      </header>

      <section className="hero">
        <p className="eyebrow">Private cloud for your company</p>
        <h1>Files, diagrams, chat and meetings in one secure place.</h1>
        <p className="lead">
          NexusDrive keeps your departments working together, with access that follows how your
          company is organised.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="hero-actions">
          <button className="button large" onClick={() => void login()}>
            Sign in
          </button>
          <button className="button secondary large" onClick={() => void register()}>
            Create an account
          </button>
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <article key={f.title} className="card feature">
            <span className="feature-icon">
              <Icon name={f.icon} />
            </span>
            <h3>{f.title}</h3>
            <p className="muted">{f.text}</p>
          </article>
        ))}
      </section>

      <footer className="landing-footer muted">NexusDrive · DevOps graduation project</footer>
    </div>
  );
}
