import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellScrollTitle, useShellTitle } from '@/app/layout.slots';
import { HeaderSearch, ScrollTitle, SyncStatusButton, useScrolledPast } from '@/components/crm';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HD-01: thành phần thanh trên', () => {
  it('ô tìm có gợi ý hai khổ, tên truy cập và mở bảng từ cả ô', () => {
    const open = vi.fn();
    render(<HeaderSearch onOpen={open} />);
    fireEvent.click(screen.getByText('Tìm khách…'));
    fireEvent.click(screen.getByText('Tìm khách, SĐT, dự án…'));
    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Tìm khách, lệnh/ }).getAttribute('aria-label')).toContain(
      'Tìm khách, SĐT, dự án…',
    );
    expect(screen.getByText('⌘K')).toBeTruthy();
  });

  it.each([
    [{ kind: 'synced', at: '09:30' }, 'Đã đồng bộ 09:30', 'text-ink-muted'],
    [{ kind: 'pending', count: 3 }, 'Chờ 3 thay đổi', 'text-soon-text'],
    [{ kind: 'error' }, 'Lỗi đồng bộ', 'text-alert-text'],
    [{ kind: 'offline' }, 'Ngoại tuyến', 'opacity-50'],
  ] as const)('đồng bộ %j: icon, nhãn ẩn, màu token và bấm mở chi tiết', (state, label, tone) => {
    const open = vi.fn();
    render(<SyncStatusButton state={state} onOpen={open} />);
    const button = screen.getByRole('button', { name: label });
    expect(button.className).toContain(tone);
    expect(button.getAttribute('data-state')).toBe(state.kind);
    expect(screen.getByText(label).className).toBe('sr-only');
    expect(button.querySelectorAll('svg.lucide-refresh-cw')).toHaveLength(1);
    const icon = button.querySelector('svg');
    expect(icon?.classList.contains('animate-spin')).toBe(state.kind === 'pending');
    if (state.kind === 'pending') expect(icon?.classList.contains('motion-reduce:animate-none')).toBe(true);
    fireEvent.click(button);
    expect(open).toHaveBeenCalledOnce();
  });

  it('đổi tiêu đề và tuổi, không lặp nội dung ẩn; thiếu tuổi thì chỉ tên', () => {
    const { rerender, container } = render(
      <ScrollTitle title="Hồ sơ khách" replacement="Nguyễn An" detail="35 tuổi" active={false} />,
    );
    expect(container.textContent).toBe('Hồ sơ khách');
    rerender(<ScrollTitle title="Hồ sơ khách" replacement="Nguyễn An" detail="35 tuổi" active />);
    expect(container.textContent).toBe('Hồ sơ kháchNguyễn An35 tuổi');
    expect(screen.getByText('35 tuổi').className).toContain('text-ink-muted');
    expect(container.firstElementChild?.className).toContain('motion-reduce:animate-none');
    rerender(<ScrollTitle title="Hồ sơ khách" replacement="Nguyễn An" active />);
    expect(container.textContent).toBe('Hồ sơ kháchNguyễn An');
    rerender(<ScrollTitle title="Hồ sơ khách" replacement="Nguyễn An" active={false} />);
    expect(container.textContent).toBe('Hồ sơ khách');
  });
});

describe('HD-01: nguồn tiêu đề khi cuộn', () => {
  it('chỉ đổi khi nguồn khuất trên mép thanh; cuộn lại, đổi khổ và tháo nguồn đều khôi phục', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    let bottom = 80;
    let desktop = true;
    let mediaChanged: (() => void) | undefined;
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return desktop;
      },
      addEventListener: (_event: string, cb: () => void) => {
        mediaChanged = cb;
      },
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const target = document.createElement('h1');
    document.body.append(target);
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => ({ bottom }) as DOMRect);
    const boundary = document.createElement('header');
    vi.spyOn(boundary, 'getBoundingClientRect').mockReturnValue({ bottom: 56 } as DOMRect);
    const { result, rerender, unmount } = renderHook(
      ({ source }) => useScrolledPast(source, { boundary, mediaQuery: '(min-width: 1280px)' }),
      { initialProps: { source: target as HTMLElement | null } },
    );
    expect(result.current).toBe(false);
    bottom = 57;
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(result.current).toBe(false);
    bottom = 56;
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(result.current).toBe(true);
    desktop = false;
    act(() => mediaChanged?.());
    expect(result.current).toBe(false);
    desktop = true;
    act(() => mediaChanged?.());
    expect(result.current).toBe(true);
    bottom = 90;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(result.current).toBe(false);
    bottom = 0;
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(result.current).toBe(true);
    rerender({ source: null });
    expect(result.current).toBe(false);
    unmount();
    target.remove();
    vi.unstubAllGlobals();
  });

  it('đổi khách cập nhật nguồn; rời màn bỏ tiêu đề đã đăng ký', () => {
    const reader = renderHook(() => useShellTitle());
    const { rerender, unmount } = render(<ShellScrollTitle target={null} title="Nguyễn An" detail="35 tuổi" />);
    expect(reader.result.current?.title).toBe('Nguyễn An');
    rerender(<ShellScrollTitle target={null} title="Trần Bình" />);
    expect(reader.result.current).toMatchObject({ title: 'Trần Bình', detail: undefined });
    unmount();
    expect(reader.result.current).toBeNull();
  });
});
