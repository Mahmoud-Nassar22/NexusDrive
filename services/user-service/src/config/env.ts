import { z } from 'zod';

/** An optional URL; an empty value means "not set". */
const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal('').transform(() => undefined));

/** All configuration comes from environment variables, validated at startup. */
export const envSchema = z.object({
  PORT: z.coerce.number().default(3003),
  KEYCLOAK_ISSUER_URL: z.string().url(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  /** Server-to-server Keycloak origin inside the cluster; empty: use the issuer URL. */
  KEYCLOAK_INTERNAL_URL: optionalUrl,
  /** Confidential client whose service account may read and manage users. */
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().min(1).default('nexusdrive-user-service'),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(1),
  /** Postgres for departments and memberships. */
  DATABASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${result.error.toString()}`);
  }
  return result.data;
}
