import { useAuth } from '../auth/auth-context';
import { config } from '../config';

/**
 * Users and roles live in Keycloak. For now this links to the Keycloak admin
 * console. TODO: an in-app user list using the Keycloak Admin REST API.
 */
export function AdminPage() {
  const { hasRole } = useAuth();
  if (!hasRole('admin')) {
    return <p className="error">Admins only.</p>;
  }

  const consoleUrl = `${config.keycloakUrl}/admin/${config.realm}/console/#/${config.realm}/users`;
  return (
    <section>
      <h1>Administration</h1>
      <p>Users, roles, password policies and MFA are managed in Keycloak.</p>
      <a className="button" href={consoleUrl} target="_blank" rel="noreferrer">
        Open user management
      </a>
    </section>
  );
}
