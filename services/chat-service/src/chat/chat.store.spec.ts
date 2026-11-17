import type { Pool } from 'pg';
import { MemoryChatStore, ROOM_PATTERN } from './chat.store';
import { PostgresChatStore } from './postgres-chat.store';

describe('MemoryChatStore', () => {
  it('returns messages per room in order', async () => {
    const store = new MemoryChatStore();
    await store.add({ room: 'a', text: 'one', from: 'alice', fromSub: '1' });
    await store.add({ room: 'b', text: 'other room', from: 'bob', fromSub: '2' });
    await store.add({ room: 'a', text: 'two', from: 'bob', fromSub: '2' });

    expect((await store.recent('a')).map((m) => m.text)).toEqual(['one', 'two']);
    expect(await store.recent('missing')).toEqual([]);
  });

  it('keeps only the latest 100 messages per room', async () => {
    const store = new MemoryChatStore();
    for (let i = 0; i < 150; i++) {
      await store.add({ room: 'busy', text: `m${i}`, from: 'x', fromSub: 'x' });
    }
    const recent = await store.recent('busy');
    expect(recent).toHaveLength(100);
    expect(recent[0].text).toBe('m50');
  });

  it('validates room names', () => {
    expect(ROOM_PATTERN.test('team-standup_1')).toBe(true);
    expect(ROOM_PATTERN.test('../etc')).toBe(false);
    expect(ROOM_PATTERN.test('')).toBe(false);
  });
});

describe('PostgresChatStore', () => {
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
    return { query, store: new PostgresChatStore(pool) };
  }

  it('creates the schema once, then inserts and maps the row', async () => {
    const { query, store } = setup();
    query
      .mockResolvedValueOnce({ rows: [] }) // schema
      .mockResolvedValueOnce({ rows: [row('7', 'hi')] });

    const msg = await store.add({ room: 'a', text: 'hi', from: 'alice', fromSub: 'uid-alice' });

    expect(query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS chat_messages');
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
    const schemaRuns = query.mock.calls.filter(([sql]) => String(sql).includes('CREATE TABLE'));
    expect(schemaRuns).toHaveLength(1);
  });

  it('returns the newest messages oldest-first', async () => {
    const { query, store } = setup();
    query
      .mockResolvedValueOnce({ rows: [] }) // schema
      .mockResolvedValueOnce({ rows: [row('3', 'third'), row('2', 'second')] });

    const msgs = await store.recent('a');

    expect(query.mock.calls[1][1]).toEqual(['a', 100]);
    expect(msgs.map((m) => m.text)).toEqual(['second', 'third']);
  });

  it('retries the schema after the database was unreachable', async () => {
    const { query, store } = setup();
    query.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(store.ping()).rejects.toThrow('ECONNREFUSED');
    await expect(store.ping()).resolves.toBeUndefined();
    const schemaRuns = query.mock.calls.filter(([sql]) => String(sql).includes('CREATE TABLE'));
    expect(schemaRuns).toHaveLength(2);
  });
});
