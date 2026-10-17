import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import { initialState } from '@/features/loan/model';
import { createLoanStore } from '@/features/loan/store';

function account(id: string, online = true) {
  let closed = false;
  const single = vi.fn().mockResolvedValue({ data: { id: 'quote-new' }, error: null });
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  const a = {
    sync: {
      local: {
        userId: id,
        assertOpen: () => {
          if (closed) throw new Error('closed');
        },
      },
      isOnline: () => online,
      client: { from: vi.fn(() => ({ insert })) },
    },
    customers: { get: vi.fn().mockResolvedValue({ id: 'c', owner_id: id }) },
  };
  return {
    a: a as unknown as RepositoryAccount,
    insert,
    single,
    close: () => {
      closed = true;
    },
  };
}
describe('loan quote storage boundary', () => {
  beforeEach(() => localStorage.clear());
  it('preserves v1 insert payload plus explicit current owner, and unknown JSON', async () => {
    const f = account('alice');
    const s = initialState();
    s.future = { keep: true };
    const store = createLoanStore(f.a);
    expect(await store.saveQuote({ customerId: 'c', unitCode: 'R30413', inputs: s, summary: { full: 1 } })).toBe(
      'quote-new',
    );
    expect(f.insert).toHaveBeenCalledWith({
      user_id: 'alice',
      customer_id: 'c',
      project_id: null,
      unit_code: 'R30413',
      inputs: s,
      summary: { full: 1 },
    });
  });
  it('does not pretend to queue offline writes', async () => {
    const f = account('alice', false);
    await expect(createLoanStore(f.a).saveQuote({ unitCode: '', inputs: initialState(), summary: {} })).rejects.toThrow(
      'Cần có mạng',
    );
    expect(f.insert).not.toHaveBeenCalled();
  });
  it('blocks a non-owner customer and closed session', async () => {
    const f = account('alice');
    vi.mocked(f.a.customers.get).mockResolvedValue({ id: 'c', owner_id: 'bob', phone: '0', full_name: 'B' });
    await expect(
      createLoanStore(f.a).saveQuote({ customerId: 'c', unitCode: '', inputs: initialState(), summary: {} }),
    ).rejects.toThrow('mình phụ trách');
    f.close();
    expect(() => createLoanStore(f.a).readSettings()).toThrow('closed');
  });
  it('isolates local settings and quote caches per account', () => {
    const a = createLoanStore(account('alice', false).a),
      b = createLoanStore(account('bob', false).a);
    a.saveLocalSettings({ loan: { ltv: 80 } });
    expect(a.readSettings()?.loan?.ltv).toBe(80);
    expect(b.readSettings()).toBeNull();
    expect(b.cachedQuotes('c')).toEqual([]);
  });
  it('does not complete into a closed account after remote response', async () => {
    const f = account('alice');
    f.single.mockImplementation(async () => {
      f.close();
      return { data: { id: 'q' }, error: null };
    });
    await expect(createLoanStore(f.a).saveQuote({ unitCode: '', inputs: initialState(), summary: {} })).rejects.toThrow(
      'closed',
    );
  });
  it('filters remote reads by current owner/customer, then serves the scoped cache offline', async () => {
    const f = account('alice');
    const quote = { id: 'q', created_at: '2026-10-16', inputs: initialState(), summary: { future: 1 } };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [quote], error: null }),
    };
    vi.mocked(f.a.sync.client.from).mockReturnValue(query as never);
    expect(await createLoanStore(f.a).listQuotes('c')).toEqual([quote]);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'alice');
    expect(query.eq).toHaveBeenCalledWith('customer_id', 'c');
    expect(await createLoanStore(account('alice', false).a).listQuotes('c')).toEqual([quote]);
    expect(await createLoanStore(account('bob', false).a).listQuotes('c')).toEqual([]);
    await createLoanStore(f.a).listQuotes(null);
    expect(query.is).toHaveBeenCalledWith('customer_id', null);
  });
});
