import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, filterItems, fold, type PaletteItem } from '@/ui/CommandPalette';

const item = (id: string, label: string, group = 'Lệnh', extra: Partial<PaletteItem> = {}): PaletteItem => ({
  id,
  label,
  group,
  onSelect: vi.fn(),
  ...extra,
});

describe('fold / filterItems', () => {
  it('bỏ dấu, đ → d, không phân biệt hoa thường', () => {
    expect(fold('Đường Hưởng')).toBe('duong huong');
  });

  it('mọi từ phải khớp (nhãn, dòng phụ, từ khoá)', () => {
    const items = [item('a', 'Công việc'), item('b', 'Tính vay', 'Lệnh', { keywords: 'lai suat ngan hang' })];
    expect(filterItems(items, 'cong viec').map((i) => i.id)).toEqual(['a']);
    expect(filterItems(items, 'ngan hang').map((i) => i.id)).toEqual(['b']);
    expect(filterItems(items, '')).toHaveLength(2);
  });
});

describe('CommandPalette', () => {
  it('khách từ `search` đứng trước lệnh; mũi tên + Enter chạy đúng mục rồi đóng', async () => {
    const onOpenChange = vi.fn();
    const cmd = item('nav.tasks', 'Công việc', 'Màn');
    const lan = item('c1', 'Nguyễn Thị Lan', 'Khách hàng', { sub: 'Đang chăm sóc' });
    const search = vi.fn((q: string) => (fold(q).includes('lan') ? [lan] : []));
    render(<CommandPalette open onOpenChange={onOpenChange} items={[cmd]} search={search} />);

    const input = screen.getByRole('combobox', { name: /Tìm khách/ });
    await userEvent.type(input, 'lan');
    const opts = await screen.findAllByRole('option');
    expect(opts[0]?.textContent).toContain('Nguyễn Thị Lan');
    expect(opts[0]?.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(lan.onSelect).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('không có kết quả → báo rõ', async () => {
    render(<CommandPalette open onOpenChange={() => {}} items={[item('a', 'Công việc')]} />);
    await userEvent.type(screen.getByRole('combobox'), 'xyz');
    expect(screen.getByText('Không thấy “xyz”')).toBeTruthy();
  });

  it('ArrowDown chuyển mục đang chọn', async () => {
    const a = item('a', 'Hôm nay', 'Màn');
    const b = item('b', 'Khách hàng', 'Màn');
    render(<CommandPalette open onOpenChange={() => {}} items={[a, b]} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(b.onSelect).toHaveBeenCalled();
    expect(a.onSelect).not.toHaveBeenCalled();
  });
});
