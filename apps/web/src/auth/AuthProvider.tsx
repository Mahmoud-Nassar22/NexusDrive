import { useEffect, useState, type ReactNode } from 'react';
import { AuthContext, type AuthState } from './auth-context';
import { initAuth, keycloak } from './keycloak';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initAuth()
      .then(() => {
        const t = keycloak.tokenParsed ?? {};
        const roles: string[] = t.realm_access?.roles ?? [];
        setState({
          user: {
            sub: t.sub ?? '',
            username: (t.preferred_username as string | undefined) ?? '',
            email: t.email as string | undefined,
            roles,
          },
          hasRole: (role) => roles.includes(role),
          logout: () => keycloak.logout({ redirectUri: window.location.origin }),
        });
      })
      .catch(() => setError('Could not reach the login server (Keycloak).'));
  }, []);

  if (error) return <p className="centered">{error}</p>;
  if (!state) return <p className="centered">Signing in…</p>;
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
