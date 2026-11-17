import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/** An optional URL; an empty value means "not set". */
const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal('').transform(() => undefined));

/** All configuration comes from environment variables, validated at startup. */
export const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  KEYCLOAK_ISSUER_URL: z.string().url(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  /** Server-to-server Keycloak origin inside the cluster; empty: use the issuer URL. */
  KEYCLOAK_INTERNAL_URL: optionalUrl,
  /** user-service base URL, asked which users' files the caller may see. */
  USER_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  S3_BUCKET: z.string().min(1),
  AWS_REGION: z.string().default('eu-central-1'),
  S3_ENDPOINT: optionalUrl,
  S3_FORCE_PATH_STYLE: bool,
  // Static keys for local S3 stand-ins only; leave unset on AWS (IRSA / Pod Identity).
  // They must be listed here: @nestjs/config only copies validated keys from .env
  // into process.env, which is where the AWS SDK reads them.
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${result.error.toString()}`);
  }
  return result.data;
}
