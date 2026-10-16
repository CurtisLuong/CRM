import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { appCommands, collectCommands } from '@/app/commands';
import { handleBack } from '@/app/layout.back';
import { NAV_TABS, tabForPath } from '@/app/layout.nav';
import { AppShell } from '@/ui/AppShell';

// T2.C3: khung app + cơ chế điều hướng/Back/đăng ký lệnh (src/app/layout*, src/app/commands).

describe('tabForPath (deep link)', () => {
  it('đường dẫn con thuộc đúng tab; ngoài 4 khu vực → null', () => {
    expect(tabForPath('/')).toBe('today');
    expect(tabForPath('/khach-hang')).toBe('customers');
    expect(tabForPath('/khach-hang/abc-123')).toBe('customers');
    expect(tabForPath('/cong-viec')).toBe('tasks');
    expect(tabForPath('/hieu-qua/marketing')).toBe('insights');
    expect(tabForPath('/khach-hang-cu')).toBeNull();
    expect(tabForPath('/dev/ui')).toBeNull();
  });
});

describe('handleBack (window.CRMBack)', () => {
  const deps = (over: Partial<Parameters<typeof handleBack>[0]> = {}) => ({
    pathname: () => '/cong-viec',
    canGoBack: () => true,
    goBack: vi.fn(),
    goHome: vi.fn(),
    ...over,
  });

  it('có lớp nổi đang mở → gửi Escape (đóng lớp trên cùng), không lùi màn', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'dialog');
    el.dataset.state = 'open';
    document.body.append(el);
    const onEsc = vi.fn();
    document.addEventListener('keydown', onEsc);
    const d = deps();
    expect(handleBack(d)).toBe(true);
    expect(onEsc).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    expect(d.goBack).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onEsc);
    el.remove();
  });

  it('không lớp nổi: lùi lịch sử → về Hôm nay → hết (false)', () => {
    const a = deps();
    expect(handleBack(a)).toBe(true);
    expect(a.goBack).toHaveBeenCalled();

    const b = deps({ canGoBack: () => false });
    expect(handleBack(b)).toBe(true);
    expect(b.goHome).toHaveBeenCalled();

    const c = deps({ canGoBack: () => false, pathname: () => '/' });
    expect(handleBack(c)).toBe(false);
  });
});

describe('collectCommands', () => {
  const noop = () => {};
  it('gom + sắp theo order; báo lỗi trùng id và thiếu export', () => {
    const r = collectCommands({
      'a/commands.ts': { commands: [{ id: 'a.x', label: 'B', order: 2, run: noop }] },
      'b/commands.ts': { commands: [{ id: 'b.y', label: 'A', order: 1, run: noop }] },
    });
    expect(r.map((c) => c.id)).toEqual(['b.y', 'a.x']);
    expect(() =>
      collectCommands({
        'a/commands.ts': { commands: [{ id: 'dup', label: 'x', run: noop }] },
        'b/commands.ts': { commands: [{ id: 'dup', label: 'y', run: noop }] },
      }),
    ).toThrow(/Trùng lệnh/);
    expect(() => collectCommands({ 'a/commands.ts': {} })).toThrow(/export const commands/);
  });

  it('lệnh sẵn có: đủ 4 màn + 3 giao diện', () => {
    const ids = appCommands.map((c) => c.id);
    for (const t of NAV_TABS) expect(ids).toContain(`nav.${t.value}`);
    expect(ids).toEqual(expect.arrayContaining(['theme.light', 'theme.dark', 'theme.system']));
  });
});

describe('AppShell', () => {
  const tabs = NAV_TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }));

  it('tab đang chọn có aria-current; bấm tab/＋/tìm gọi đúng hàm; sync null → không hiện chỉ báo', async () => {
    const onNavigate = vi.fn();
    const onAdd = vi.fn();
    const onSearch = vi.fn();
    render(
      <AppShell
        title="Khách hàng"
        tabs={tabs}
        active="customers"
        onNavigate={onNavigate}
        onAdd={onAdd}
        onSearch={onSearch}
        sync={null}
        railExpanded={false}
        onToggleRail={() => {}}
      >
        <p>nội dung</p>
      </AppShell>,
    );
    // Bottom nav (mobile) + rail (desktop) cùng có trong DOM, CSS ẩn theo cỡ màn.
    const current = screen.getAllByRole('button', { current: 'page' });
    expect(current.length).toBe(2);
    expect(current.every((b) => b.textContent?.includes('Khách hàng'))).toBe(true);
    await userEvent.click(screen.getAllByRole('button', { name: /Công việc/ })[0] as HTMLElement);
    expect(onNavigate).toHaveBeenCalledWith('tasks');
    await userEvent.click(screen.getAllByRole('button', { name: 'Ghi nhanh' })[0] as HTMLElement);
    expect(onAdd).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Tìm khách, lệnh/ }));
    expect(onSearch).toHaveBeenCalled();
    expect(screen.queryByText(/đồng bộ/i)).toBeNull();
  });

  it('có trạng thái đồng bộ → hiện chỉ báo', () => {
    render(
      <AppShell
        title="Hôm nay"
        tabs={tabs}
        active="today"
        onNavigate={() => {}}
        onAdd={() => {}}
        onSearch={() => {}}
        sync={{ kind: 'pending', count: 3 }}
        railExpanded
        onToggleRail={() => {}}
      >
        <p>nội dung</p>
      </AppShell>,
    );
    expect(screen.getByText('Chờ 3 thay đổi')).toBeTruthy();
  });
});
