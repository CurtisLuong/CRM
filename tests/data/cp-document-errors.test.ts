import { describe, expect, it, vi } from 'vitest';
import type { CustomerRepository } from '@/data/repositories/customers';
import { createRemoteRepository } from '@/data/repositories/remote';
import type { CustomerSync } from '@/data/sync';

describe('CP: đọc tài liệu không biến lỗi thành danh sách trống', () => {
  it('chuyển lỗi server tới UI, nhưng danh sách đọc thành công có thể trống', async () => {
    const result = { data: null as unknown, error: { message: 'permission denied' } as unknown };
    const query = { select: () => query, eq: () => query, order: async () => result };
    const sync = {
      local: { assertOpen: vi.fn() },
      isOnline: () => true,
      client: { from: () => query },
    } as unknown as CustomerSync;
    const remote = createRemoteRepository(sync, {} as CustomerRepository);
    await expect(remote.listDocuments('c1')).rejects.toEqual({ message: 'permission denied' });
    result.error = null;
    result.data = [];
    await expect(remote.listDocuments('c1')).resolves.toEqual([]);
  });
});
