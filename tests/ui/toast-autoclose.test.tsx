import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '@/ui/Toast';

let show: ReturnType<typeof useToast> = () => {};
function Probe() {
  show = useToast();
  return null;
}

afterEach(() => vi.useRealTimers());

// Curtis 09/11: thông báo hiện ~2 giây rồi tự tắt, bấm hay không bấm; có Hoàn tác thì 4 giây.
describe('Toast tự tắt', () => {
  it('thông báo thường tắt sau 2 giây', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    act(() => show({ title: 'Đã thêm việc', description: 'Hồ sơ · Khách' }));
    expect(screen.getByText('Đã thêm việc')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.queryByText('Đã thêm việc')).toBeNull();
  });

  it('thông báo có Hoàn tác còn ở 2 giây, tắt sau 4 giây', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    act(() => show({ title: 'Đã lưu trữ khách', onUndo: () => {} }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByText('Đã lưu trữ khách')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText('Đã lưu trữ khách')).toBeNull();
  });
});
