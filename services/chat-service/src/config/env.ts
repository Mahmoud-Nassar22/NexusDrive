import { z } from 'zod';

/** An optional URL; an empty value (e.g. `REDIS_URL=` in .env) means "not set". */
const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal('').transform(() => undefined));

/** All configuration comes from environment variables, validated at startup. */
export const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  KEYCLOAK_ISSUER_URL: z.string().url(),
  KEYCLOAK_AUDIENCE: z.string().optional(),
  /** Server-to-server Keycloak origin inside the cluster; empty: use the issuer URL. */
  KEYCLOAK_INTERNAL_URL: optionalUrl,
  /** Public LiveKit URL the browser connects to (ws:// locally, wss:// in production). */
  LIVEKIT_URL: z.string().min(1),
  /** LiveKit server API (rooms) from this service; empty: LIVEKIT_URL with ws→http. */
  LIVEKIT_API_URL: optionalUrl,
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  /** Postgres for chat rooms and message history. */
  DATABASE_URL: z.string().url(),
  /** user-service base URL, asked for the caller's department (room access). */
  USER_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  /** Redis for the socket.io adapter. Empty: rooms are local to one replica. */
  REDIS_URL: optionalUrl,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${result.error.toString()}`);
  }
  return result.data;
}
