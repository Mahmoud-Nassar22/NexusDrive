import { useEffect, useState, type ReactNode } from 'react';
import { LandingPage } from '../pages/LandingPage';
import { AuthContext, type AuthState } from './auth-context';
import { initAuth, keycloak } from './keycloak';

type Status = { kind: 'loading' } | { kind: 'anonymous' } | { kind: 'error' } | AuthReady;
type AuthReady = { kind: 'ready'; state: AuthState };

/** Shows the landing page to visitors and the app to signed-in users. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    initAuth()
      .then((authenticated) => {
        if (!authenticated) {
          setStatus({ kind: 'anonymous' });
          return;
        }
        const t = keycloak.tokenParsed ?? {};
        const roles: string[] = t.realm_access?.roles ?? [];
        setStatus({
          kind: 'ready',
          state: {
            user: {
              sub: t.sub ?? '',
              username: (t.preferred_username as string | undefined) ?? '',
              firstName: t.given_name as string | undefined,
              email: t.email as string | undefined,
              roles,
            },
            hasRole: (role) => roles.includes(role),
            logout: () => keycloak.logout({ redirectUri: window.location.origin }),
          },
        });
      })
      .catch(() => setStatus({ kind: 'error' }));
  }, []);

  switch (status.kind) {
    case 'loading':
      return <p className="centered muted">Loading…</p>;
    case 'error':
      return <LandingPage error="Could not reach the login server. Please try again shortly." />;
    case 'anonymous':
      return <LandingPage />;
    case 'ready':
      return <AuthContext.Provider value={status.state}>{children}</AuthContext.Provider>;
  }
}
