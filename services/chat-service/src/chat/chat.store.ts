import { OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import type { DepartmentRole } from '../directory/user-directory.client';

export interface ChatMessage {
  id: string;
  room: string;
  text: string;
  from: string;
  fromSub: string;
  at: string;
}

export type NewChatMessage = Omit<ChatMessage, 'id' | 'at'>;

/**
 * Who may join: everyone in the company (`departmentId` empty) or one
 * department, narrowed by the lowest department role allowed in.
 */
export interface ChatRoom {
  id: string;
  title: string;
  departmentId?: string;
  departmentName?: string;
  minRole: DepartmentRole;
  createdBy: string;
  createdAt: string;
  lastMessage?: { from: string; text: string; at: string };
}

export type NewChatRoom = Omit<ChatRoom, 'createdAt' | 'lastMessage'>;

export const ROOM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** How many messages `recent()` returns per room. */
export const MAX_PER_ROOM = 100;
/** Company-wide room that always exists. */
export const DEFAULT_ROOM = 'general';

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

  CREATE TABLE IF NOT EXISTS chat_rooms (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    department_id   UUID,            -- user-service department; NULL: whole company
    department_name TEXT,            -- copy for display
    min_role        TEXT NOT NULL DEFAULT 'worker' CHECK (min_role IN ('worker', 'lead', 'head')),
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  INSERT INTO chat_rooms (id, title, created_by)
    VALUES ('${DEFAULT_ROOM}', 'General', 'system') ON CONFLICT (id) DO NOTHING;
`;

interface MessageRow {
  id: string;
  room: string;
  text: string;
  from_username: string;
  from_sub: string;
  created_at: Date;
}

interface RoomRow {
  id: string;
  title: string;
  department_id: string | null;
  department_name: string | null;
  min_role: DepartmentRole;
  created_by: string;
  created_at: Date;
  last_from?: string | null;
  last_text?: string | null;
  last_at?: Date | null;
}

const MESSAGE_COLUMNS = 'id, room, text, from_username, from_sub, created_at';
const ROOM_SQL = `
  SELECT r.*, m.from_username AS last_from, m.text AS last_text, m.created_at AS last_at
  FROM chat_rooms r
  LEFT JOIN LATERAL (
    SELECT from_username, text, created_at FROM chat_messages
    WHERE room = r.id ORDER BY id DESC LIMIT 1
  ) m ON true`;

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

function toRoom(row: RoomRow): ChatRoom {
  return {
    id: row.id,
    title: row.title,
    departmentId: row.department_id ?? undefined,
    departmentName: row.department_name ?? undefined,
    minRole: row.min_role,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    lastMessage:
      row.last_at && row.last_from != null && row.last_text != null
        ? { from: row.last_from, text: row.last_text, at: row.last_at.toISOString() }
        : undefined,
  };
}

/** Chat rooms and their message history in PostgreSQL, shared by every replica. */
export class ChatStore implements OnModuleDestroy {
  private schema?: Promise<void>;

  constructor(private readonly pool: Pool) {}

  // ---- messages

  async add(input: NewChatMessage): Promise<ChatMessage> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<MessageRow>(
      `INSERT INTO chat_messages (room, text, from_username, from_sub)
       VALUES ($1, $2, $3, $4)
       RETURNING ${MESSAGE_COLUMNS}`,
      [input.room, input.text, input.from, input.fromSub],
    );
    return toMessage(rows[0]);
  }

  /** The latest MAX_PER_ROOM messages of a room, oldest first. */
  async recent(room: string): Promise<ChatMessage[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM chat_messages WHERE room = $1 ORDER BY id DESC LIMIT $2`,
      [room, MAX_PER_ROOM],
    );
    return rows.reverse().map(toMessage);
  }

  // ---- rooms

  /** All rooms, most recently active first. */
  async listRooms(): Promise<ChatRoom[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<RoomRow>(
      `${ROOM_SQL} ORDER BY COALESCE(m.created_at, r.created_at) DESC`,
    );
    return rows.map(toRoom);
  }

  async getRoom(id: string): Promise<ChatRoom | undefined> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<RoomRow>(`${ROOM_SQL} WHERE r.id = $1`, [id]);
    return rows[0] ? toRoom(rows[0]) : undefined;
  }

  async createRoom(room: NewChatRoom): Promise<ChatRoom> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<RoomRow>(
      `INSERT INTO chat_rooms (id, title, department_id, department_name, min_role, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        room.id,
        room.title,
        room.departmentId ?? null,
        room.departmentName ?? null,
        room.minRole,
        room.createdBy,
      ],
    );
    return toRoom(rows[0]);
  }

  /** Deletes a room and its history in one statement. Returns false if it didn't exist. */
  async deleteRoom(id: string): Promise<boolean> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ n: number }>(
      `WITH deleted AS (DELETE FROM chat_rooms WHERE id = $1 RETURNING id),
            history AS (DELETE FROM chat_messages WHERE room IN (SELECT id FROM deleted))
       SELECT count(*)::int AS n FROM deleted`,
      [id],
    );
    return rows[0].n > 0;
  }

  // ---- lifecycle

  /** Readiness check: the database answers and the tables exist. */
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
