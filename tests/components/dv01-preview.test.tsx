import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageDocument, PdfDocument } from '@/lib/document-viewer/preview';

const { loadPdf } = vi.hoisted(() => ({ loadPdf: vi.fn() }));
vi.mock('@/lib/document-viewer/pdf', () => ({ loadPdf }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DV-01 tài nguyên xem trước', () => {
  it('ảnh giữ tỉ lệ và thu hồi object URL khi đóng', async () => {
    const create = vi.fn(() => 'blob:preview');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 1600;
        naturalHeight = 1000;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(value: string) {
          if (value) queueMicrotask(() => this.onload?.());
        }
      },
    );
    const { unmount } = render(<ImageDocument blob={new Blob(['image'])} name="Ảnh.png" onError={vi.fn()} />);
    const img = await screen.findByRole('img', { name: 'Ảnh.png' });
    expect(img.className).toContain('object-contain');
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:preview');
  });
  it('PDF vẽ theo DPR, huỷ render và tài liệu khi đóng', async () => {
    const cancel = vi.fn();
    const destroy = vi.fn(async () => {});
    const viewport = vi.fn(({ scale }: { scale: number }) => ({ width: 240 * scale, height: 320 * scale }));
    const draw = vi.fn(() => ({ promise: Promise.resolve(), cancel }));
    loadPdf.mockResolvedValueOnce({
      numPages: 1,
      getPage: async () => ({ pageNumber: 1, getViewport: viewport, render: draw }),
      loadingTask: { destroy },
    });
    const previous = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    const { unmount } = render(<PdfDocument blob={new Blob(['pdf'])} onError={vi.fn()} />);
    await screen.findByRole('img', { name: 'Trang 1' });
    await waitFor(() => expect(draw).toHaveBeenCalled());
    expect(viewport).toHaveBeenCalledWith({ scale: 2 });
    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: previous });
  });
});
