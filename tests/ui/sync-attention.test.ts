import { describe, expect, it } from 'vitest';
import { syncLabel, syncNeedsAttention } from '@/components/crm/header-controls';

// Curtis 11/11: nút đồng bộ trên thanh đầu chỉ hiện khi cần chú ý; trạng thái thường xem trong menu ⋮.
describe('nút đồng bộ trên thanh đầu', () => {
  it('ẩn khi đã đồng bộ, đang gửi, hoặc chưa có trạng thái', () => {
    expect(syncNeedsAttention({ kind: 'synced', at: '09:30' })).toBe(false);
    expect(syncNeedsAttention({ kind: 'pending', count: 3 })).toBe(false);
    expect(syncNeedsAttention(null)).toBe(false);
  });
  it('hiện khi lỗi đồng bộ hoặc ngoại tuyến', () => {
    expect(syncNeedsAttention({ kind: 'error' })).toBe(true);
    expect(syncNeedsAttention({ kind: 'offline' })).toBe(true);
  });
  it('chữ trạng thái dùng chung cho nút và hàng menu', () => {
    expect(syncLabel({ kind: 'synced', at: '09:30' })).toBe('Đã đồng bộ 09:30');
    expect(syncLabel({ kind: 'pending', count: 3 })).toBe('Chờ 3 thay đổi');
    expect(syncLabel({ kind: 'offline' })).toBe('Ngoại tuyến');
    expect(syncLabel({ kind: 'error' })).toBe('Lỗi đồng bộ');
  });
});
