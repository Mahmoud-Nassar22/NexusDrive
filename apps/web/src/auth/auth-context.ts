import { createContext, useContext } from 'react';

export interface User {
  sub: string;
  username: string;
  firstName?: string;
  email?: string;
  roles: string[];
}

export interface AuthState {
  user: User;
  hasRole: (role: string) => boolean;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
