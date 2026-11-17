import type { Pool } from 'pg';
import { ChatStore, ROOM_PATTERN } from './chat.store';

const row = (id: string, text: string) => ({
  id,
  room: 'a',
  text,
  from_username: 'alice',
  from_sub: 'uid-alice',
  created_at: new Date('2026-01-01T00:00:00Z'),
});

function setup() {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const pool = { query, end: jest.fn() } as unknown as Pool;
  return { query, store: new ChatStore(pool) };
}

const schemaRuns = (query: jest.Mock) =>
  query.mock.calls.filter(([sql]) => String(sql).includes('CREATE TABLE')).length;

describe('ChatStore', () => {
  it('validates room ids', () => {
    expect(ROOM_PATTERN.test('team-standup_1')).toBe(true);
    expect(ROOM_PATTERN.test('../etc')).toBe(false);
    expect(ROOM_PATTERN.test('')).toBe(false);
  });

  it('creates the schema (with the General room) once, then inserts and maps', async () => {
    const { query, store } = setup();
    query
      .mockResolvedValueOnce({ rows: [] }) // schema
      .mockResolvedValueOnce({ rows: [row('7', 'hi')] });

    const msg = await store.add({ room: 'a', text: 'hi', from: 'alice', fromSub: 'uid-alice' });

    expect(query.mock.calls[0][0]).toContain("VALUES ('general', 'General', 'system')");
    expect(query.mock.calls[1][1]).toEqual(['a', 'hi', 'alice', 'uid-alice']);
    expect(msg).toEqual({
      id: '7',
      room: 'a',
      text: 'hi',
      from: 'alice',
      fromSub: 'uid-alice',
      at: '2026-01-01T00:00:00.000Z',
    });
    await store.recent('a');
    expect(schemaRuns(query)).toBe(1);
  });

  it('returns the newest messages oldest-first', async () => {
    const { query, store } = setup();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row('3', 'third'), row('2', 'second')] });

    const msgs = await store.recent('a');

    expect(query.mock.calls[1][1]).toEqual(['a', 100]);
    expect(msgs.map((m) => m.text)).toEqual(['second', 'third']);
  });

  it('maps rooms with their last message', async () => {
    const { query, store } = setup();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'r-1',
          title: 'Eng leads',
          department_id: 'd-1',
          department_name: 'Engineering',
          min_role: 'lead',
          created_by: 'demo',
          created_at: new Date('2026-01-01T00:00:00Z'),
          last_from: 'dave',
          last_text: 'standup moved',
          last_at: new Date('2026-01-02T00:00:00Z'),
        },
      ],
    });

    const [room] = await store.listRooms();

    expect(room).toMatchObject({
      id: 'r-1',
      departmentId: 'd-1',
      minRole: 'lead',
      lastMessage: { from: 'dave', text: 'standup moved' },
    });
  });

  it('retries the schema after the database was unreachable', async () => {
    const { query, store } = setup();
    query.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(store.ping()).rejects.toThrow('ECONNREFUSED');
    await expect(store.ping()).resolves.toBeUndefined();
    expect(schemaRuns(query)).toBe(2);
  });
});
