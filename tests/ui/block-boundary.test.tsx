import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockBoundary } from '@/ui';

function Good() {
  return <p>Nội dung khối</p>;
}

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <p>Nội dung khối</p>;
}

describe('BlockBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('con bình thường → hiện nội dung con, không có alert', () => {
    render(
      <BlockBoundary label="hàng đợi">
        <Good />
      </BlockBoundary>,
    );
    expect(screen.getByText('Nội dung khối')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('con ném lỗi → alert + Thử lại, không hiện nội dung con', () => {
    render(
      <BlockBoundary label="hàng đợi">
        <Bomb shouldThrow />
      </BlockBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Không hiển thị được hàng đợi.');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(screen.queryByText('Nội dung khối')).toBeNull();
  });

  it('bấm Thử lại → con render lại, hết alert', async () => {
    // Cờ tắt trước khi bấm: React 19 tự render lại root khi gặp lỗi nên đếm số lần
    // render không phân biệt được lần thử lại của người dùng.
    let failing = true;
    function MaybeThrow() {
      if (failing) throw new Error('boom');
      return <p>Nội dung khối</p>;
    }

    render(
      <BlockBoundary label="hàng đợi">
        <MaybeThrow />
      </BlockBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.getByText('Nội dung khối')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('resetKey đổi → xoá lỗi và render lại con', () => {
    const { rerender } = render(
      <BlockBoundary label="hàng đợi" resetKey="a">
        <Bomb shouldThrow />
      </BlockBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(
      <BlockBoundary label="hàng đợi" resetKey="b">
        <Bomb shouldThrow={false} />
      </BlockBoundary>,
    );
    expect(screen.getByText('Nội dung khối')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
