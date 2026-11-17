import { OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { ChatStore, MAX_PER_ROOM, type ChatMessage, type NewChatMessage } from './chat.store';

/**
 * Created on first use. TODO: move to a migration tool (e.g. node-pg-migrate)
 * once the schema starts changing.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS chat_messages (
    id            BIGSERIAL PRIMARY KEY,
    room          TEXT        NOT NULL,
    text          TEXT        NOT NULL,
    from_username TEXT        NOT NULL,
    from_sub      TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS chat_messages_room_id_idx ON chat_messages (room, id DESC);
`;

interface MessageRow {
  id: string;
  room: string;
  text: string;
  from_username: string;
  from_sub: string;
  created_at: Date;
}

const COLUMNS = 'id, room, text, from_username, from_sub, created_at';

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: String(row.id),
    room: row.room,
    text: row.text,
    from: row.from_username,
    fromSub: row.from_sub,
    at: row.created_at.toISOString(),
  };
}

/** Chat history in PostgreSQL, so it survives restarts and is shared by every replica. */
export class PostgresChatStore extends ChatStore implements OnModuleDestroy {
  private schema?: Promise<void>;

  constructor(private readonly pool: Pool) {
    super();
  }

  async add(input: NewChatMessage): Promise<ChatMessage> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<MessageRow>(
      `INSERT INTO chat_messages (room, text, from_username, from_sub)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.room, input.text, input.from, input.fromSub],
    );
    return toMessage(rows[0]);
  }

  async recent(room: string): Promise<ChatMessage[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<MessageRow>(
      `SELECT ${COLUMNS} FROM chat_messages WHERE room = $1 ORDER BY id DESC LIMIT $2`,
      [room, MAX_PER_ROOM],
    );
    return rows.reverse().map(toMessage);
  }

  /** Readiness check: the database answers and the table exists. */
  async ping(): Promise<void> {
    await this.ensureSchema();
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Runs the schema once. If the database is down, the next call retries, so the
   * service can start before Postgres and become ready once it is reachable.
   */
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
