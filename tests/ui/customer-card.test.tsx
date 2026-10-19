import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomerCard, SessionBar, SlaBar, StatTile } from '@/ui';

describe('CustomerCard (D-023)', () => {
  it('thẻ đầy đủ: tên, đúng 1 nút hành động có chữ, ô cấp 2 khác rỗng, ghi chú, SLA', async () => {
    const onCall = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <CustomerCard
        name="Bùi Thị Hồng Nhung"
        sub="Quá 1 giờ · hẹn 08:30"
        tone="over"
        action={{ label: 'Gọi', icon: 'call', onClick: onCall }}
        onOpen={onOpen}
        facts={[
          { label: 'Gọi gần nhất', value: 'Hôm qua 15:00 · Không nghe máy' },
          { label: 'Đã gọi', value: '3 lần' },
          { label: 'Nguồn', value: '' },
        ]}
        note="Hỏi giá căn 2PN"
        sla={{ label: 'Đang chăm sóc', state: 'ok', ratio: 5 / 7, text: 'mục tiêu còn 2 ngày' }}
      />,
    );
    const card = container.querySelector('[data-card]') as HTMLElement;
    expect(card.dataset.tone).toBe('over');
    const call = within(card).getByRole('button', { name: 'Gọi Bùi Thị Hồng Nhung' });
    expect(call.textContent).toContain('Gọi');
    // L2: ngoài nút mở thẻ, chỉ có MỘT nút hành động.
    expect(within(card).getAllByRole('button')).toHaveLength(2);
    expect(within(card).getByText('3 lần')).toBeTruthy();
    expect(within(card).queryByText('Nguồn')).toBeNull();
    expect(within(card).getByText('“Hỏi giá căn 2PN”')).toBeTruthy();
    expect(within(card).getByText('mục tiêu còn 2 ngày')).toBeTruthy();
    await userEvent.click(call);
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.click(within(card).getByRole('button', { name: 'Mở Bùi Thị Hồng Nhung' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('thẻ gọn: không hiện ô cấp 2, ghi chú, SLA; nút chỉ có icon nhưng có tên truy cập', () => {
    render(
      <CustomerCard
        compact
        name="Lê Minh Tuấn"
        sub="10:00 · lần 2/5"
        action={{ label: 'Gọi', icon: 'call', onClick: () => {} }}
        facts={[{ label: 'Đã gọi', value: '2 lần' }]}
        note="không hiện"
        sla={{ label: 'Bậc', state: 'warn', ratio: 0.9, text: 'x' }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Gọi Lê Minh Tuấn' });
    expect(btn.textContent).toBe('');
    expect(screen.queryByText('2 lần')).toBeNull();
    expect(screen.queryByText('“không hiện”')).toBeNull();
  });
});

describe('SlaBar', () => {
  const filled = (container: HTMLElement, cls: string) =>
    [...container.querySelectorAll('i')].filter((i) => i.className.includes(cls)).length;

  it('7 đoạn; ratio 5/7 → 5 đoạn đầy màu thường', () => {
    const { container } = render(<SlaBar label="Bậc" state="ok" ratio={5 / 7} text="t" />);
    expect(container.querySelectorAll('i')).toHaveLength(7);
    expect(filled(container, 'bg-bar')).toBe(5);
  });

  it('quá hạn mức → đỏ, ratio > 1 vẫn tối đa 7', () => {
    const { container } = render(<SlaBar label="Bậc" state="over" ratio={1.6} text="quá hạn 2 ngày" />);
    expect(filled(container, 'bg-danger')).toBe(7);
  });

  it('quá mục tiêu → vàng, luôn có ít nhất 1 đoạn', () => {
    const { container } = render(<SlaBar label="Bậc" state="warn" ratio={0} text="t" />);
    expect(filled(container, 'bg-warning')).toBe(1);
  });
});

describe('SessionBar, StatTile', () => {
  it('SessionBar gọi onStart', async () => {
    const onStart = vi.fn();
    render(<SessionBar title="Gọi lần lượt 9 khách" sub="~35 phút" onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('StatTile rỗng → "—" + "Chưa đủ dữ liệu"; có số → bấm được', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<StatTile label="Nói chuyện được" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Chưa đủ dữ liệu')).toBeTruthy();
    rerender(<StatTile label="Nói chuyện được" value={42} unit="%" sub="63/150 cuộc gọi" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
