import { z } from 'zod';

/** All configuration comes from environment variables, validated at startup. */
export const envSchema = z.object({
  PORT: z.coerce.number().default(3003),
  KEYCLOAK_ISSUER_URL: z.string().url(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  /** Confidential client whose service account may read and manage users. */
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().min(1).default('nexusdrive-user-service'),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${result.error.toString()}`);
  }
  return result.data;
}
