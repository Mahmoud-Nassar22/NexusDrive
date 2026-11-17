import { ChatStore, ROOM_PATTERN } from './chat.store';

describe('ChatStore', () => {
  it('returns messages per room in order', () => {
    const store = new ChatStore();
    store.add({ room: 'a', text: 'one', from: 'alice', fromSub: '1' });
    store.add({ room: 'b', text: 'other room', from: 'bob', fromSub: '2' });
    store.add({ room: 'a', text: 'two', from: 'bob', fromSub: '2' });

    expect(store.recent('a').map((m) => m.text)).toEqual(['one', 'two']);
    expect(store.recent('missing')).toEqual([]);
  });

  it('keeps only the latest 100 messages per room', () => {
    const store = new ChatStore();
    for (let i = 0; i < 150; i++) {
      store.add({ room: 'busy', text: `m${i}`, from: 'x', fromSub: 'x' });
    }
    const recent = store.recent('busy');
    expect(recent).toHaveLength(100);
    expect(recent[0].text).toBe('m50');
  });

  it('validates room names', () => {
    expect(ROOM_PATTERN.test('team-standup_1')).toBe(true);
    expect(ROOM_PATTERN.test('../etc')).toBe(false);
    expect(ROOM_PATTERN.test('')).toBe(false);
  });
});
