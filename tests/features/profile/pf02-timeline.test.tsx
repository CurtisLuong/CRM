import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';
import { ProfileTimeline } from '@/features/profile/timeline';
import { ToastProvider } from '@/ui';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const base = { id: 'c1', owner_id: 'u1', full_name: 'Khách PF-02', phone: '0911234567' };

const standard = {
  ...base,
  care_stage_history: [
    { at: at(1, 10), stage: 'Đang chăm sóc', note: 'Ghi chú mốc bậc' },
    { at: at(3, 10), stage: 'Xem dự án' },
  ],
  call_attempts: [
    { at: at(1, 9), result: 'no_answer' },
    { at: at(3, 11), result: 'talked' },
  ],
  notes_manual: [{ at: at(1, 10), text: 'Ghi chú trong bậc' }],
  interactions: [{ at: at(2, 15), channel: 'zalo', kind: 'sent' }],
} as Customer;

function renderTimeline(customer: Customer) {
  return render(
    <ToastProvider>
      <ProfileTimeline
        customer={customer}
        entries={customerTimeline(customer)}
        writable
        busy={false}
        onSave={vi.fn(async () => true)}
      />
    </ToastProvider>,
  );
}

describe('ProfileTimeline PF-02', () => {
  it('phân nhóm theo bậc; mỗi mục có đúng một icon; con nằm trong đường dọc', () => {
    const { container } = renderTimeline(standard);
    expect(screen.getByRole('heading', { level: 3, name: 'Bậc: Xem dự án' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Trước khi có mốc bậc' })).toBeTruthy();
    const rows = [...container.querySelectorAll('[data-timeline-entry]')];
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.querySelectorAll('svg')).toHaveLength(1);
    const headers = [...container.querySelectorAll('[data-timeline-header]')];
    expect(headers).toHaveLength(3);
    for (const header of headers) expect(header.querySelectorAll('svg')).toHaveLength(1);
    // Đường dọc nối các mục con trong nhóm (cả 3 nhóm đều có mục con).
    expect(container.querySelectorAll('[data-timeline-group] .border-l-2')).toHaveLength(3);
  });

  it('lọc "Cuộc gọi" ẩn ghi chú và ghi chú của mốc bậc, giữ đầu nhóm có cuộc gọi', () => {
    renderTimeline(standard);
    expect(screen.getByText('Ghi chú mốc bậc')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Cuộc gọi/ }));
    expect(screen.queryByText('Ghi chú mốc bậc')).toBeNull();
    expect(screen.queryByText('Ghi chú trong bậc')).toBeNull();
    expect(screen.getByText('Nói chuyện được')).toBeTruthy();
    expect(screen.getByText('Không nghe máy')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Bậc: Xem dự án' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sửa ghi chú lịch sử bậc' })).toBeNull();
  });

  it('lọc "Bậc" chỉ còn đầu nhóm, không còn mục con', () => {
    const { container } = renderTimeline(standard);
    fireEvent.click(screen.getByRole('button', { name: /^Bậc/ }));
    expect(container.querySelectorAll('[data-timeline-group]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-timeline-entry]')).toHaveLength(0);
    expect(screen.queryByText('Trước khi có mốc bậc')).toBeNull();
  });

  it('khách không có mốc bậc: danh sách phẳng, không tiêu đề nhóm', () => {
    const { container } = renderTimeline({ ...standard, care_stage_history: [] } as Customer);
    expect(container.querySelectorAll('[data-timeline-group]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-timeline-entry]')).toHaveLength(4);
    expect(screen.queryByText('Trước khi có mốc bậc')).toBeNull();
  });
});
