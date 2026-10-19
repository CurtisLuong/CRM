import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailBlock } from '@/features/insights/detail';
import { splitInsights } from '@/features/insights/model';

describe('splitInsights', () => {
  it('giữ tối đa 3 quan sát ở đầu trang, phần dư vào khối chi tiết', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(splitInsights(items)).toEqual({ top: ['a', 'b', 'c'], rest: ['d', 'e'] });
    expect(splitInsights(['a'])).toEqual({ top: ['a'], rest: [] });
    expect(splitInsights([])).toEqual({ top: [], rest: [] });
  });
});

describe('DetailBlock', () => {
  it('mặc định đóng; bấm nút đúng tên khối để mở/đóng nội dung', () => {
    render(
      <DetailBlock id="care-detail" title="Chăm sóc chi tiết" open={false} onToggle={() => {}}>
        <p>Nội dung chăm sóc</p>
      </DetailBlock>,
    );
    const toggle = screen.getByRole('button', { name: 'Chăm sóc chi tiết' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Nội dung chăm sóc')).toBeNull();
  });

  it('mở thì hiện nội dung và aria-expanded=true', () => {
    render(
      <DetailBlock id="care-detail" title="Chăm sóc chi tiết" open onToggle={() => {}}>
        <p>Nội dung chăm sóc</p>
      </DetailBlock>,
    );
    expect(screen.getByRole('button', { name: 'Chăm sóc chi tiết' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Nội dung chăm sóc')).toBeTruthy();
  });

  it('gọi onToggle khi bấm', () => {
    let calls = 0;
    render(
      <DetailBlock id="funnel-detail" title="Phễu & tuần" open={false} onToggle={() => (calls += 1)}>
        <p>Nội dung</p>
      </DetailBlock>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Phễu & tuần' }));
    expect(calls).toBe(1);
  });
});
