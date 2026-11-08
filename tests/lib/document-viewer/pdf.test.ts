import { describe, expect, it, vi } from 'vitest';
import { loadPdf } from '@/lib/document-viewer/pdf';

const state = vi.hoisted(() => ({ getDocument: vi.fn(), options: { workerSrc: '' } }));
vi.mock('pdfjs-dist', () => ({ getDocument: state.getDocument, GlobalWorkerOptions: state.options }));
describe('DV-01 vòng đời pdf.js', () => {
  it('nạp dữ liệu blob, worker dùng tài nguyên đi kèm, huỷ lượt tải đang chờ', async () => {
    let started!: () => void;
    const loading = new Promise<void>((resolve) => {
      started = resolve;
    });
    let reject!: (reason: Error) => void;
    const promise = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    const destroy = vi.fn(async () => {
      reject(new DOMException('Huỷ', 'AbortError'));
    });
    state.getDocument.mockImplementationOnce(() => {
      started();
      return { promise, destroy };
    });
    const controller = new AbortController();
    const blob = { arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer } as Blob;
    const result = loadPdf(blob, controller.signal);
    await loading;
    expect(state.getDocument).toHaveBeenCalledWith({ data: new Uint8Array([37, 80, 68, 70]) });
    expect(state.options.workerSrc).toContain('pdf.worker.min.mjs');
    expect(state.options.workerSrc).not.toMatch(/^https?:/);
    controller.abort();
    await expect(result).rejects.toHaveProperty('name', 'AbortError');
    expect(destroy).toHaveBeenCalled();
  });
});
