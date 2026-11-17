import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReadinessRegistry } from '@nexusdrive/common';
import { Pool, type QueryResultRow } from 'pg';
import type { Env } from '../config/env';

/**
 * Created on first use. TODO: move to a migration tool (e.g. node-pg-migrate)
 * once the schema starts changing.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS departments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS department_members (
    user_id       TEXT PRIMARY KEY,          -- Keycloak sub; a user is in at most one department
    username      TEXT NOT NULL,             -- copy for display
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('head', 'lead', 'worker')),
    lead_id       TEXT REFERENCES department_members(user_id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS department_one_head
    ON department_members (department_id) WHERE role = 'head';
  CREATE INDEX IF NOT EXISTS department_members_department_idx ON department_members (department_id);
  CREATE INDEX IF NOT EXISTS department_members_lead_idx ON department_members (lead_id);
`;

export type Query = <R extends QueryResultRow>(sql: string, params?: unknown[]) => Promise<R[]>;

/** Postgres access for user-service (departments and memberships). */
@Injectable()
export class Database implements OnModuleDestroy {
  private readonly logger = new Logger(Database.name);
  private readonly pool: Pool;
  private schema?: Promise<void>;

  constructor(config: ConfigService<Env, true>, readiness: ReadinessRegistry) {
    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 10,
      connectionTimeoutMillis: 3000,
    });
    // Without a listener, an idle connection dropped by the server (restart,
    // failover) emits an unhandled 'error' and kills the process.
    this.pool.on('error', (err) => this.logger.warn(`postgres idle client: ${err.message}`));
    readiness.register('postgres', () => this.query('SELECT 1'));
  }

  query: Query = async (sql, params) => {
    await this.ensureSchema();
    return (await this.pool.query(sql, params)).rows;
  };

  /** Runs `fn` in a transaction; rolls back if it throws. */
  async transaction<T>(fn: (query: Query) => Promise<T>): Promise<T> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(async (sql, params) => (await client.query(sql, params)).rows);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /** Runs once; retried on the next call if the database was unreachable. */
  private ensureSchema(): Promise<void> {
    this.schema ??= this.pool.query(SCHEMA_SQL).then(
      () => undefined,
      (err: unknown) => {
        this.schema = undefined;
        throw err;
      },
    );
    return this.schema;
  }
}
