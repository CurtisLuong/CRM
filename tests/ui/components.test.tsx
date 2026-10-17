import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, DeadlineTag, HealthDot, IconButton, MetricTile, OutcomePicker, Sheet } from '@/ui';
import { initials } from '@/ui/rows';

describe('Button', () => {
  it('loading → khoá nút + aria-busy', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Lưu
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Lưu' });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
  });

  it('IconButton có nhãn cho screen reader', () => {
    render(<IconButton icon="call" label="Gọi chị Lan" />);
    expect(screen.getByRole('button', { name: 'Gọi chị Lan' })).toBeTruthy();
  });
});

describe('DeadlineTag', () => {
  it('quá hạn/đến hạn luôn có chữ trạng thái, không chỉ màu', () => {
    const { rerender, container } = render(<DeadlineTag tag={{ state: 'missed', text: '2 giờ' }} />);
    expect(container.textContent).toBe('Quá hạn·2 giờ');
    rerender(<DeadlineTag tag={{ state: 'due', text: 'đến hạn' }} time="14:30" />);
    expect(container.textContent).toBe('Đến hạn·14:30');
  });

  it('không có tag → không vẽ gì', () => {
    const { container } = render(<DeadlineTag tag={null} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('HealthDot · MetricTile', () => {
  it('HealthDot có chữ cho screen reader', () => {
    render(<HealthDot health="risk" />);
    expect(screen.getByText('Nguy cơ').className).toContain('sr-only');
  });

  it('MetricTile thiếu dữ liệu → "—" + "Chưa đủ dữ liệu"', () => {
    render(<MetricTile label="Giờ gọi tốt" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Chưa đủ dữ liệu')).toBeTruthy();
  });
});

describe('initials', () => {
  it('lấy 2 từ cuối của tên Việt', () => {
    expect(initials('Nguyễn Thị Lan')).toBe('TL');
    expect(initials('Đỗ')).toBe('Đ');
  });
});

describe('OutcomePicker', () => {
  it('chọn 1 trong 4 nút lớn trả mã lưu; "Khác" mở đủ kết quả còn lại', async () => {
    const onChange = vi.fn();
    render(<OutcomePicker value={null} onValueChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /Không nghe/ }));
    expect(onChange).toHaveBeenCalledWith('no_answer');
    await userEvent.click(screen.getByRole('button', { name: 'Khác…' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Máy bận' }));
    expect(onChange).toHaveBeenLastCalledWith('line_busy');
  });
});

function DraftSheet({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onClose();
      }}
      title="Ghi chú"
      dirty={text.length > 0}
    >
      <textarea aria-label="Nội dung" value={text} onChange={(e) => setText(e.target.value)} />
    </Sheet>
  );
}

describe('Sheet', () => {
  it('không có nháp → Esc đóng ngay', () => {
    const onClose = vi.fn();
    render(<DraftSheet onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('có nháp → Esc/Đóng hỏi lại; "Tiếp tục nhập" giữ nội dung; "Bỏ nháp" mới đóng', async () => {
    const onClose = vi.fn();
    render(<DraftSheet onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Nội dung'), 'Hẹn thứ Bảy');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục nhập' }));
    expect((screen.getByLabelText('Nội dung') as HTMLTextAreaElement).value).toBe('Hẹn thứ Bảy');
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ nháp' }));
    expect(onClose).toHaveBeenCalled();
  });
});
