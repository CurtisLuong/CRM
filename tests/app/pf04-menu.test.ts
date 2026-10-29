import { describe, expect, it } from 'vitest';
import { type AppCommand, appCommands } from '@/app/commands';
import { buildMenu } from '@/app/menu.model';

// PF-04: menu ⋮ có nhóm — gom lệnh thuần theo cấu hình nhóm, không phụ thuộc React.

const itemLabels = (commands: AppCommand[]) =>
  buildMenu(commands).map((section) => ({
    key: section.key,
    kind: section.kind,
    items: section.items.map((item) => item.label),
  }));

describe('buildMenu (PF-04)', () => {
  it('đủ 3 nhóm đúng thứ tự; mục trong nhóm đúng thứ tự luật 2', () => {
    expect(itemLabels(appCommands)).toEqual([
      { key: 'customers', kind: 'grid', items: ['Khách mới', 'Tệp & Retarget', 'Khách đã lưu trữ'] },
      {
        key: 'tools',
        kind: 'grid',
        // U-04: Thủ tục (16) đứng sau Tài liệu (15).
        items: ['Giỏ hàng', 'Tài liệu', 'Thủ tục', 'Tính khoản vay', 'Thao tác nhanh', 'Nhập / Xuất dữ liệu'],
      },
      { key: 'settings', kind: 'rows', items: ['Đồng nghiệp', 'Cài đặt'] },
    ]);
  });

  it('không có hai mục cùng icon trong menu', () => {
    const icons = buildMenu(appCommands).flatMap((section) => section.items.map((item) => item.icon));
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('lệnh tools chưa khai báo nhóm → cuối Công cụ, không biến mất', () => {
    const fake: AppCommand = { id: 'fake.chua-nhom', label: 'Mục chưa xếp nhóm', tools: true, run: () => {} };
    const tools = buildMenu([fake, ...appCommands]).find((section) => section.key === 'tools');
    expect(tools?.items.at(-1)?.id).toBe('fake.chua-nhom');
    expect(tools?.items.at(-1)?.icon).toBe('apps');
  });

  it('nhóm rỗng thì ẩn; lệnh không phải tools (giao diện, tab) không vào menu', () => {
    const withoutCustomers = appCommands.filter((command) => command.menu?.group !== 'customers');
    expect(buildMenu(withoutCustomers).map((section) => section.key)).toEqual(['tools', 'settings']);

    const ids = buildMenu(appCommands).flatMap((section) => section.items.map((item) => item.id));
    expect(ids.some((id) => id.startsWith('theme.') || id.startsWith('nav.'))).toBe(false);
  });

  it('nhãn menu ngắn, không đổi nhãn lệnh ở Bảng lệnh', () => {
    const leadCommand = appCommands.find((command) => command.id === 'leads.open');
    expect(leadCommand?.label).toBe('Mở Khách mới');
    const customers = buildMenu(appCommands).find((section) => section.key === 'customers');
    expect(customers?.items.find((item) => item.id === 'leads.open')?.label).toBe('Khách mới');
  });
});
